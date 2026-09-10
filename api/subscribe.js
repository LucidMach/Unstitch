// /api/subscribe.js
// Vercel Serverless Function for newsletter signups

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { name, email, source } = body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!isValidEmail) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    let prisma;
    try {
      const dbModule = await import('../src/lib/prisma.js');
      prisma = dbModule.prisma;
    } catch {
      prisma = null;
    }

    if (prisma) {
      try {
        await prisma.subscriber.upsert({
          where: { email: cleanEmail },
          update: {
            signupCount: { increment: 1 },
            name: cleanName || undefined,
            source: source || undefined,
          },
          create: {
            name: cleanName || null,
            email: cleanEmail,
            source: source || null,
            signupCount: 1,
          },
        });
        console.log('✓ Successfully saved subscriber via Prisma to Neon Postgres:', cleanEmail);
      } catch (dbErr) {
        console.error('Neon Postgres connection/insert error:', dbErr);
      }
    } else {
      console.log('Subscriber received (dev/mock):', { cleanName, cleanEmail, source });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' });
  }
}

