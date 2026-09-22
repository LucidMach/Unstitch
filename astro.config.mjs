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
            /** @type {any} */
            let handler;

            if (endpoint === '/api/subscribe') {
              handler = (await import('./api/subscribe.js')).default;
            } else if (endpoint === '/api/contact') {
              handler = (await import('./api/contact.js')).default;
            } else if (endpoint === '/api/share') {
              handler = (await import('./api/share.js')).default;
            } else if (endpoint === '/api/create-checkout-session') {
              handler = (await import('./api/create-checkout-session.js')).default;
            } else if (endpoint === '/api/stripe-webhook') {
              handler = (await import('./api/stripe-webhook.js')).default;
            } else if (endpoint === '/api/order-status') {
              handler = (await import('./api/order-status.js')).default;
            } else if (endpoint === '/api/admin/login') {
              handler = (await import('./api/admin/login.js')).default;
            } else if (endpoint === '/api/admin/logout') {
              handler = (await import('./api/admin/logout.js')).default;
            } else if (endpoint === '/api/admin/orders') {
              handler = (await import('./api/admin/orders.js')).default;
            } else if (endpoint === '/api/admin/product') {
              handler = (await import('./api/admin/product.js')).default;
            } else if (endpoint === '/api/admin/send-email') {
              handler = (await import('./api/admin/send-email.js')).default;
            } else if (endpoint === '/api/admin/inventory') {
              handler = (await import('./api/admin/inventory.js')).default;
            } else if (endpoint === '/api/admin/manual-order') {
              handler = (await import('./api/admin/manual-order.js')).default;
            } else if (endpoint === '/api/admin/customers') {
              handler = (await import('./api/admin/customers.js')).default;
            } else if (endpoint === '/api/order-lookup-request') {
              handler = (await import('./api/order-lookup-request.js')).default;
            } else if (endpoint === '/api/order-lookup') {
              handler = (await import('./api/order-lookup.js')).default;
            } else if (endpoint === '/api/delivery-quote') {
              handler = (await import('./api/delivery-quote.js')).default;
            } else if (endpoint === '/api/drop-status') {
              handler = (await import('./api/drop-status.js')).default;
            } else if (endpoint === '/api/passport') {
              handler = (await import('./api/passport.js')).default;
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