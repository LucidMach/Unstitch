// /api/subscribe.js
//
// A Vercel Serverless Function — Vercel deploys anything in /api
// automatically as its own backend endpoint, even for a plain static
// HTML/CSS/JS site like this one. No framework needed.
//
// SETUP (one-time):
// 1. In your Vercel project dashboard: Storage tab → Create Database →
//    Postgres. Connect it to this project. Vercel automatically adds the
//    POSTGRES_URL environment variable for you — nothing to copy/paste.
// 2. Install the client library: run `npm install @vercel/postgres` in
//    your project root (this adds it to package.json).
// 3. Put this file at /api/subscribe.js in your project root.
// 4. Deploy (git push, or `vercel deploy`). That's it — the table below
//    is created automatically the first time someone subscribes.
//
// WANT TO SEE YOUR SUBSCRIBERS?
// Vercel dashboard → Storage → your Postgres database → "Query" tab, run:
//   SELECT * FROM subscribers ORDER BY created_at DESC;
// Or export as CSV directly from that same screen.

import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email } = req.body || {};

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!isValidEmail) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Runs once effectively (IF NOT EXISTS) — safe to leave in place.
    await sql`
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        source TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    const source = typeof req.body?.source === 'string' ? req.body.source.slice(0, 64) : null;

    await sql`
      INSERT INTO subscribers (name, email, source)
      VALUES (${cleanName || null}, ${cleanEmail}, ${source})
      ON CONFLICT (email) DO NOTHING;
    `;

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}
