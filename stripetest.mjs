import stripe from './src/lib/stripe.js';
if (!stripe) { console.error('stripe is null'); process.exit(1); }
try {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'aud',
          product_data: { name: 'Slow Bloom (DIAGNOSTIC TEST - do not pay)', description: 'test' },
          unit_amount: 2900,
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'aud',
          product_data: { name: 'Delivery — Australia Post — beyond 10km' },
          unit_amount: 1020,
        },
        quantity: 1,
      },
    ],
    shipping_address_collection: { allowed_countries: ['AU'] },
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    success_url: 'https://unstitchx.com/order/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://unstitchx.com/order/cancelled',
  });
  console.log('SESSION URL:', session.url);
  console.log('AMOUNT_TOTAL (raw, before completion):', session.amount_total);
  const full = await stripe.checkout.sessions.retrieve(session.id, { expand: ['line_items'] });
  console.log('LINE ITEMS:', JSON.stringify(full.line_items?.data?.map(li => ({ description: li.description, amount_total: li.amount_total, quantity: li.quantity })), null, 2));
  // Immediately expire it so no real hold lingers
  await stripe.checkout.sessions.expire(session.id);
  console.log('Session expired (cleaned up).');
} catch (e) {
  console.error('ERROR:', e.message);
}
