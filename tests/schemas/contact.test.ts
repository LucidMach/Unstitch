import { describe, it, expect } from 'vitest';
import { ContactSchema, ALLOWED_SUBJECTS } from '../../src/lib/schemas/contact.js';

describe('ContactSchema validation', () => {
  const baseValidPayload = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    countryCode: '+61',
    phoneNumber: '0412 345 678',
    subject: 'general-enquiry',
    message: 'Hello, I would like to inquire about upcoming workshops.',
    marketingOptIn: true,
    _gotcha: '',
    details: {
      location: 'Melbourne',
    },
  };

  it('validates and transforms a full valid contact payload', () => {
    const result = ContactSchema.safeParse(baseValidPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jane Doe');
      expect(result.data.email).toBe('jane@example.com');
      expect(result.data.phone).toBe('+61 0412 345 678');
      expect(result.data.marketingOptIn).toBe(true);
      expect(result.data.details).toEqual({ location: 'Melbourne' });
    }
  });

  it('handles optional phone number cleanly when omitted', () => {
    const payload = {
      name: 'Alex Smith',
      email: 'alex@example.com',
      subject: 'school-workshop-enquiry',
      message: 'Interested in booking a session for 30 high school students.',
    };

    const result = ContactSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBeNull();
      expect(result.data.marketingOptIn).toBe(false);
    }
  });

  it('rejects invalid email addresses', () => {
    const invalidEmails = ['invalid-email', 'test@', '@domain.com', 'test@domain'];
    for (const email of invalidEmails) {
      const res = ContactSchema.safeParse({ ...baseValidPayload, email });
      expect(res.success).toBe(false);
    }
  });

  it('rejects names shorter than 2 characters', () => {
    const res = ContactSchema.safeParse({ ...baseValidPayload, name: 'A' });
    expect(res.success).toBe(false);
  });

  it('rejects messages shorter than 10 characters', () => {
    const res = ContactSchema.safeParse({ ...baseValidPayload, message: 'Too short' });
    expect(res.success).toBe(false);
  });

  it('rejects disallowed subject types', () => {
    const res = ContactSchema.safeParse({ ...baseValidPayload, subject: 'invalid-subject' });
    expect(res.success).toBe(false);
  });

  it('accepts all allowed subject enum values', () => {
    for (const subject of ALLOWED_SUBJECTS) {
      const res = ContactSchema.safeParse({ ...baseValidPayload, subject });
      expect(res.success).toBe(true);
    }
  });

  it('rejects invalid country dial codes', () => {
    const res = ContactSchema.safeParse({
      ...baseValidPayload,
      countryCode: '61', // missing '+'
    });
    expect(res.success).toBe(false);
  });

  it('rejects bot submissions when honeypot _gotcha is filled', () => {
    const res = ContactSchema.safeParse({
      ...baseValidPayload,
      _gotcha: 'http://spam-link.com',
    });
    expect(res.success).toBe(false);
  });

  it('coerces various truthy values for marketingOptIn', () => {
    const variations = [true, 'true', 'on'];
    for (const val of variations) {
      const res = ContactSchema.safeParse({ ...baseValidPayload, marketingOptIn: val });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.marketingOptIn).toBe(true);
      }
    }
  });
});
