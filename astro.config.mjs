// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  const root = process.cwd();
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];
  for (const file of envFiles) {
    const fullPath = path.resolve(root, file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let value = trimmed.slice(eqIdx + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (key) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

loadDotEnv();

/** @returns {any} */
function apiDevMiddleware() {
  return {
    name: 'api-dev-middleware',
    /** @param {any} server */
    configureServer(server) {
      loadDotEnv();
      server.middlewares.use(
        /**
         * @param {any} req
         * @param {any} res
         * @param {() => void} next
         */
        async (req, res, next) => {
          // Mirrors vercel.json's rewrite for local dev: the digital
          // passport's clean URL (/passport/UX-D001-007 — what's actually
          // printed on a physical kit's QR code) has no matching static
          // route under `output: "static"` with no dynamic segments, so it
          // rewrites to the single static page + a query param, same as
          // production. Query-param form (/passport?serial=...) keeps
          // working unchanged either way.
          if (req.url && /^\/passport\/[^/?]+/.test(req.url)) {
            const [, rest] = req.url.split('/passport/');
            const serial = decodeURIComponent(rest.split('?')[0]);
            req.url = `/passport?serial=${encodeURIComponent(serial)}`;
          }

          if (req.url && req.url.startsWith('/api/')) {
            const endpoint = req.url.split('?')[0];
            const load = async (/** @type {string} */ file) => (await import(`${file}?t=${Date.now()}`)).default;
            /** @type {any} */
            let handler;

            if (endpoint === '/api/subscribe') {
              handler = await load('./src/server/subscribe.js');
            } else if (endpoint === '/api/contact') {
              handler = await load('./src/server/contact.js');
            } else if (endpoint === '/api/share') {
              handler = await load('./src/server/share.js');
            } else if (endpoint === '/api/create-checkout-session') {
              handler = await load('./api/create-checkout-session.js');
            } else if (endpoint === '/api/stripe-webhook') {
              handler = await load('./api/stripe-webhook.js');
            } else if (endpoint === '/api/order-status') {
              handler = await load('./src/server/order-status.js');
            } else if (endpoint === '/api/admin/login') {
              handler = await load('./src/server/admin/login.js');
            } else if (endpoint === '/api/admin/logout') {
              handler = await load('./src/server/admin/logout.js');
            } else if (endpoint === '/api/admin/orders') {
              handler = await load('./src/server/admin/orders.js');
            } else if (endpoint === '/api/admin/product') {
              handler = await load('./src/server/admin/product.js');
            } else if (endpoint === '/api/admin/send-email') {
              handler = await load('./src/server/admin/send-email.js');
            } else if (endpoint === '/api/admin/inventory') {
              handler = await load('./src/server/admin/inventory.js');
            } else if (endpoint === '/api/admin/manual-order') {
              handler = await load('./src/server/admin/manual-order.js');
            } else if (endpoint === '/api/admin/customers') {
              handler = await load('./src/server/admin/customers.js');
            } else if (endpoint === '/api/admin/events') {
              handler = await load('./src/server/admin/events.js');
            } else if (endpoint === '/api/admin/batch-drops') {
              handler = await load('./src/server/admin/batch-drops.js');
            } else if (endpoint === '/api/events') {
              handler = await load('./src/server/events.js');
            } else if (endpoint === '/api/order-lookup-request') {
              handler = await load('./src/server/order-lookup-request.js');
            } else if (endpoint === '/api/order-lookup') {
              handler = await load('./src/server/order-lookup.js');
            } else if (endpoint === '/api/delivery-quote') {
              handler = await load('./src/server/delivery-quote.js');
            } else if (endpoint === '/api/drop-status') {
              handler = await load('./src/server/drop-status.js');
            } else if (endpoint === '/api/passport') {
              handler = await load('./src/server/passport.js');
            } else if (endpoint === '/api/passport-confirm-transfer') {
              handler = await load('./src/server/passport-confirm-transfer.js');
            }

            // The webhook needs the exact raw request bytes for Stripe
            // signature verification — JSON-parsing it here (like every
            // other endpoint below) would corrupt the byte string before
            // the handler ever sees it. Buffer the raw body instead and
            // hand it to the handler via `req.rawBody`, matching what
            // `api/stripe-webhook.js`'s own `getRawBody()` looks for.
            const isRawBodyEndpoint = endpoint === '/api/stripe-webhook';

            if (handler) {
              /** @type {Buffer[]} */
              const chunks = [];
              req.on('data', (/** @type {Buffer} */ chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              });
              req.on('end', async () => {
                const rawBody = Buffer.concat(chunks);

                if (isRawBodyEndpoint) {
                  /** @type {any} */ (req).rawBody = rawBody;
                } else {
                  /** @type {any} */ (req).body = {};
                  try {
                    /** @type {any} */ (req).body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
                  } catch {
                    /** @type {any} */ (req).body = {};
                  }
                }

                /** @type {any} */ (res).status = (/** @type {number} */ code) => {
                  res.statusCode = code;
                  return res;
                };
                /** @type {any} */ (res).json = (/** @type {any} */ data) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                  return res;
                };

                try {
                  await handler(req, res);
                } catch (err) {
                  const message = err instanceof Error ? err.message : 'Internal server error';
                  console.error(`Dev API Error [${endpoint}]:`, err);
                  if (!res.writableEnded) {
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: message }));
                  }
                }
              });
              return;
            }
          }
          next();
        }
      );
    }
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://www.unstitchx.com',
  integrations: [react()],

  vite: {
    plugins: [tailwindcss(), apiDevMiddleware()]
  }
});