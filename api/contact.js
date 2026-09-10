// /api/contact.js
// Vercel Serverless Function for contact form submissions

const NOTIFY_EMAIL = 'unstitchxfactory@gmail.com';

const ALLOWED_SUBJECTS = new Set([
  'general-enquiry',
  'school-workshop-enquiry',
  'corporate-workshop-enquiry',
  'venue-partnership-enquiry',
  'surplus-material-enquiry',
  'custom-piece-enquiry',
]);

const subjectLabel = (value) =>
  value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};

    const cleanName = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    const cleanEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
    const cleanPhone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : null;
    const cleanSubject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const cleanMessage = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';
    const marketingOptIn = body.marketingOptIn === true || body.marketingOptIn === 'true' || body.marketingOptIn === 'on';

    const rawDetails = body.details && typeof body.details === 'object' ? body.details : {};
    const details = {};
    for (const [key, value] of Object.entries(rawDetails)) {
      if (typeof key === 'string' && key.length <= 60) {
        details[key] = typeof value === 'string' ? value.slice(0, 1000) : value;
      }
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!cleanName || !isValidEmail || !cleanMessage) {
      return res.status(400).json({ error: 'Please fill in your name, a valid email, and a message.' });
    }
    if (!ALLOWED_SUBJECTS.has(cleanSubject)) {
      return res.status(400).json({ error: 'Please choose a subject.' });
    }

    if (process.env.POSTGRES_URL) {
      try {
        const { sql } = await import('@vercel/postgres');
        await sql`
          CREATE TABLE IF NOT EXISTS contact_submissions (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            subject TEXT NOT NULL,
            message TEXT NOT NULL,
            marketing_opt_in BOOLEAN DEFAULT FALSE,
            details JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `;

        await sql`
          INSERT INTO contact_submissions (name, email, phone, subject, message, marketing_opt_in, details)
          VALUES (${cleanName}, ${cleanEmail}, ${cleanPhone}, ${cleanSubject}, ${cleanMessage}, ${marketingOptIn}, ${JSON.stringify(details)}::jsonb);
        `;
      } catch (dbErr) {
        console.warn('Contact Postgres save failed:', dbErr);
      }
    } else {
      console.log('Contact submission received (dev/mock):', {
        cleanName,
        cleanEmail,
        cleanPhone,
        cleanSubject,
        cleanMessage,
        details,
      });
    }

    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const detailLines = Object.entries(details)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');

        await resend.emails.send({
          from: 'Unstitch Website <onboarding@resend.dev>',
          to: NOTIFY_EMAIL,
          reply_to: cleanEmail,
          subject: `New enquiry — ${subjectLabel(cleanSubject)}`,
          text: [
            `${cleanName} (${cleanEmail}${cleanPhone ? `, ${cleanPhone}` : ''})`,
            '',
            cleanMessage,
            detailLines ? `\n---\n${detailLines}` : '',
            `\nMarketing opt-in: ${marketingOptIn ? 'Yes' : 'No'}`,
          ].join('\n'),
        });
      } catch (emailErr) {
        console.error('Contact notification email failed:', emailErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
