// src/lib/schemas/contact.js
import { z } from 'zod';

export const ALLOWED_SUBJECTS = [
  'general-enquiry',
  'school-workshop-enquiry',
  'corporate-workshop-enquiry',
  'venue-partnership-enquiry',
  'surplus-material-enquiry',
  'custom-piece-enquiry',
];

export const subjectLabels = {
  'general-enquiry': 'General Enquiry',
  'school-workshop-enquiry': 'School Workshop',
  'corporate-workshop-enquiry': 'Corporate Workshop',
  'venue-partnership-enquiry': 'Venue Partnership',
  'surplus-material-enquiry': 'Surplus Material Partnership',
  'custom-piece-enquiry': 'Custom Piece / Commission',
};

// Sub-schemas for subject details
// Documents the shape the school form on /contact sends in `details`. Kept
// permissive on purpose (everything optional): the page enforces which fields
// are required, and ContactSchema's sanitizer below is what actually cleans
// whatever arrives. `tracks` and `facilities` are multiselect arrays.
export const SchoolWorkshopDetailsSchema = z.object({
  schoolName: z.string().trim().max(150).optional().default(''),
  yourRole: z.string().trim().max(150).optional().default(''),
  yearLevel: z.string().trim().max(100).optional().default(''),
  studentCount: z.string().trim().max(10).optional().default(''),
  preferredTerm: z.string().trim().max(150).optional().default(''),
  budget: z.string().trim().max(100).optional().default(''),
  tracks: z.array(z.string().trim().max(150)).max(12).optional().default([]),
  hearAbout: z.string().trim().max(100).optional().default(''),
  accessibilityNeeds: z.string().trim().max(1000).optional().default(''),
});

export const CorporateWorkshopDetailsSchema = z.object({
  companyName: z.string().trim().max(150, 'Company name must be under 150 characters').optional().default(''),
  teamSize: z.string().trim().max(100, 'Team size must be under 100 characters').optional().default(''),
});

export const VenuePartnershipDetailsSchema = z.object({
  venueName: z.string().trim().max(150, 'Venue name must be under 150 characters').optional().default(''),
  eventType: z.string().trim().max(100, 'Event type must be under 100 characters').optional().default(''),
});

export const SurplusMaterialDetailsSchema = z.object({
  materialType: z.string().trim().max(200, 'Material type must be under 200 characters').optional().default(''),
  estimatedVolume: z.string().trim().max(100, 'Estimated volume must be under 100 characters').optional().default(''),
});

export const CustomPieceDetailsSchema = z.object({
  projectScope: z.string().trim().max(200, 'Project scope must be under 200 characters').optional().default(''),
  targetTimeline: z.string().trim().max(100, 'Target timeline must be under 100 characters').optional().default(''),
});

/**
 * Zod schema for incoming contact form payload
 */
export const ContactSchema = z
  .object({
    name: z
      .string({ message: 'Please enter your name' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be under 100 characters'),

    email: z
      .string({ message: 'Please enter your email address' })
      .trim()
      .toLowerCase()
      .email({ message: 'Please enter a valid email address' })
      .max(255, 'Email must be under 255 characters'),

    countryCode: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{0,3}$/, 'Country dial code must be in the format +61 or +1')
      .optional()
      .nullable(),

    phoneNumber: z
      .string()
      .trim()
      .max(30, 'Phone number must be under 30 characters')
      .optional()
      .nullable()
      .refine(
        (val) => !val || /^[0-9\s\-().]{5,25}$/.test(val),
        'Phone number must contain valid digits and characters'
      ),

    phone: z.string().trim().max(40).optional().nullable(),

    subject: z.enum(ALLOWED_SUBJECTS, {
      message: 'Please select a valid enquiry subject',
    }),

    message: z
      .string({ message: 'Please enter your message' })
      .trim()
      .min(10, 'Message must be at least 10 characters')
      .max(3000, 'Message must be under 3000 characters'),

    marketingOptIn: z
      .union([z.boolean(), z.string()])
      .transform((val) => val === true || val === 'true' || val === 'on')
      .default(false),

    // Honeypot spam trap: must be empty/blank
    _gotcha: z
      .string()
      .max(0, 'Spam detected')
      .optional()
      .nullable()
      .transform((val) => val || ''),

    details: z.record(z.string(), z.any()).optional().default({}),
  })
  .transform((data) => {
    // Standardize combined phone number if separate country code and phone were provided
    let normalizedPhone = data.phone || null;
    if (data.phoneNumber) {
      const code = data.countryCode || '+61';
      normalizedPhone = `${code} ${data.phoneNumber}`.trim();
    }

    // Sanitize details map
    const cleanDetails: Record<string, any> = {};
    if (data.details && typeof data.details === 'object') {
      for (const [k, v] of Object.entries(data.details).slice(0, 30)) {
        if (typeof k !== 'string' || k.length > 60 || v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
          // Multiselect fields (e.g. school workshop tracks): keep only a
          // short list of trimmed strings so a crafted request can't bloat
          // the stored record or the notification email.
          const items = v
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim().slice(0, 150))
            .filter(Boolean)
            .slice(0, 15);
          if (items.length) cleanDetails[k] = items;
        } else {
          cleanDetails[k] = typeof v === 'string' ? v.trim().slice(0, 1000) : v;
        }
      }
    }

    return {
      ...data,
      phone: normalizedPhone,
      details: cleanDetails,
    };
  });

export type ContactInput = z.infer<typeof ContactSchema>;

