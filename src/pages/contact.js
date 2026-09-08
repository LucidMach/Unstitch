// /api/contact.js
//
// A Vercel Serverless Function, same pattern as /api/subscribe.js — no
// framework needed, Vercel deploys anything in /api automatically.
//
// SETUP (one-time):
// 1. If you've already set up Postgres for /api/subscribe.js, you're done
//    with this step — both functions share the same database. Otherwise:
//    Vercel dashboard → Storage tab → Create Database → Postgres, then
//    connect it to this project (adds the POSTGRES_URL env var for you).
// 2. Install both client libraries in your project root:
//      npm install @vercel/postgres resend
// 3. Put this file at /api/contact.js in your project root.
// 4. Email notifications (sends to unstitchxfactory@gmail.com below):
//      a. Sign up at https://resend.com (free tier covers this easily).
//      b. Dashboard → API Keys → create one.
//      c. Vercel project → Settings → Environment Variables → add
//         RESEND_API_KEY with that value.
//    No Gmail login, password, or app-password needed at all — Resend
//    just sends TO that inbox like any other email provider would.
//    Until you verify your own domain with Resend, emails will show as
//    coming from "onboarding@resend.dev" (still lands in Gmail fine) —
//    verify unstitchx.com with Resend later to send from your own
//    address instead.
// 5. Deploy. The table is created automatically on first submission.
//
// WHY "details" IS ONE JSONB COLUMN INSTEAD OF SEPARATE COLUMNS:
// The contact form's extra fields change depending on the subject someone
// picks (school name vs. budget range vs. material type — see
// contact.html). Rather than adding a database column every time a new
// subject or field is added, everything subject-specific is passed
// through as a single JSON object and stored in one JSONB column.
// Postgres can still query inside it later, e.g.:
//   SELECT * FROM contact_submissions WHERE details->>'budgetRange' = '15k-plus';
//
// WANT TO SEE SUBMISSIONS?
// Vercel dashboard → Storage → your Postgres database → "Query" tab, run:
//   SELECT * FROM contact_submissions ORDER BY created_at DESC;
//
// STILL TO WIRE UP:
// - reCAPTCHA verification (the form already shows the required legal
//   text, but nothing server-side checks a token yet — see the note
//   near the bottom of this file).

import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

// Where enquiry notifications get sent. Change this if the inbox changes.
const NOTIFY_EMAIL = 'unstitchxfactory@gmail.com';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Keep this in sync with the <option value="..."> list in contact.html.
const ALLOWED_SUBJECTS = new Set([
  'general-enquiry',
  'school-workshop-enquiry',
  'corporate-workshop-enquiry',
  'venue-partnership-enquiry',
  'surplus-material-enquiry',
  'custom-piece-enquiry',
]);

// Turns "school-workshop-enquiry" into "School Workshop Enquiry" for a
// readable email subject line.
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

    // details: whatever subject-specific fields came through (schoolName,
    // budgetRange, materialType, etc.) — stored as-is, whitelisted only by
    // size so a new field added to the form later needs no backend change.
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

    // Runs once effectively (IF NOT EXISTS) — safe to leave in place.
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

    // ---- notify unstitchxfactory@gmail.com by email ----
    // Wrapped in its own try/catch: if Resend is down or misconfigured,
    // the enquiry is still saved above — a flaky notification shouldn't
    // make the visitor see an error when their message actually went
    // through. If RESEND_API_KEY isn't set yet, this quietly skips
    // itself rather than crashing (see the `resend` guard above).
    if (resend) {
      try {
        const detailLines = Object.entries(details)
          .map(([key, value]) => `${key}: ${value}`)
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
        console.error('contact notification email failed:', emailErr);
      }
    }

    // ---- OPTIONAL: verify reCAPTCHA before accepting the submission ----
    // The form already displays the required reCAPTCHA legal text, but no
    // token is actually generated or checked yet. To make it real:
    // 1. Add the reCAPTCHA v3 script to contact.html and get a token
    //    client-side on submit.
    // 2. Send that token here as `body.recaptchaToken`.
    // 3. Verify it server-side before the INSERT above:
    //
    // const verify = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //   body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${body.recaptchaToken}`,
    // }).then((r) => r.json());
    // if (!verify.success || verify.score < 0.5) {
    //   return res.status(400).json({ error: 'Verification failed. Please try again.' });
    // }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}

