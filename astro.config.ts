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

function apiDevMiddleware(): any {
  return {
    name: 'api-dev-middleware',
    configureServer(server: any) {
      loadDotEnv();
      server.middlewares.use(
        async (req: any, res: any, next: () => void) => {
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

          if (req.url && /^\/shop\/[^/?]+/.test(req.url)) {
            const [, rest] = req.url.split('/shop/');
            const slug = decodeURIComponent(rest.split('?')[0]);
            if (slug && slug !== 'all' && slug !== 'countdown') {
              req.url = `/shop?slug=${encodeURIComponent(slug)}`;
            }
          }

          if (req.url && req.url.startsWith('/api/')) {
            const endpoint = req.url.split('?')[0];
            try {
              const load = async (file: string) => {
                if (typeof server.ssrLoadModule === 'function') {
                  const fullPath = path.resolve(process.cwd(), file);
                  const mod = await server.ssrLoadModule(fullPath);
                  return mod.default || mod;
                }
                return (await import(/* @vite-ignore */ `${file}?t=${Date.now()}`)).default;
              };
              let handler: any;

              if (endpoint === '/api/subscribe') {
                handler = await load('./src/server/subscribe.ts');
              } else if (endpoint === '/api/contact') {
                handler = await load('./src/server/contact.ts');
              } else if (endpoint === '/api/share') {
                handler = await load('./src/server/share.ts');
              } else if (endpoint === '/api/create-checkout-session') {
                handler = await load('./api/create-checkout-session.ts');
              } else if (endpoint === '/api/stripe-webhook') {
                handler = await load('./api/stripe-webhook.ts');
              } else if (endpoint === '/api/order-status') {
                handler = await load('./src/server/order-status.ts');
              } else if (endpoint === '/api/admin/login') {
                handler = await load('./src/server/admin/login.ts');
              } else if (endpoint === '/api/admin/logout') {
                handler = await load('./src/server/admin/logout.ts');
              } else if (endpoint === '/api/admin/orders') {
                handler = await load('./src/server/admin/orders.ts');
              } else if (endpoint === '/api/admin/product') {
                handler = await load('./src/server/admin/product.ts');
              } else if (endpoint === '/api/admin/send-email') {
                handler = await load('./src/server/admin/send-email.ts');
              } else if (endpoint === '/api/admin/inventory') {
                handler = await load('./src/server/admin/inventory.ts');
              } else if (endpoint === '/api/admin/manual-order') {
                handler = await load('./src/server/admin/manual-order.ts');
              } else if (endpoint === '/api/admin/customers') {
                handler = await load('./src/server/admin/customers.ts');
              } else if (endpoint === '/api/admin/events') {
                handler = await load('./src/server/admin/events.ts');
              } else if (endpoint === '/api/admin/batch-drops') {
                handler = await load('./src/server/admin/batch-drops.ts');
              } else if (endpoint === '/api/admin/settings') {
                handler = await load('./src/server/admin/settings.ts');
              } else if (endpoint === '/api/admin/broadcast') {
                handler = await load('./src/server/admin/broadcast.ts');
              } else if (endpoint === '/api/unsubscribe') {
                handler = await load('./src/server/unsubscribe.ts');
              } else if (endpoint === '/api/events') {
                handler = await load('./src/server/events.ts');
              } else if (endpoint === '/api/order-lookup-request') {
                handler = await load('./src/server/order-lookup-request.ts');
              } else if (endpoint === '/api/order-lookup') {
                handler = await load('./src/server/order-lookup.ts');
              } else if (endpoint === '/api/order-lookup-by-number') {
                handler = await load('./src/server/order-lookup-by-number.ts');
              } else if (endpoint === '/api/delivery-quote') {
                handler = await load('./src/server/delivery-quote.ts');
              } else if (endpoint === '/api/drop-status') {
                handler = await load('./src/server/drop-status.ts');
              } else if (endpoint === '/api/passport') {
                handler = await load('./src/server/passport.ts');
              } else if (endpoint === '/api/passport-confirm-transfer') {
                handler = await load('./src/server/passport-confirm-transfer.ts');
              }

              // The webhook needs the exact raw request bytes for Stripe
              // signature verification — JSON-parsing it here (like every
              // other endpoint below) would corrupt the byte string before
              // the handler ever sees it. Buffer the raw body instead and
              // hand it to the handler via `req.rawBody`, matching what
              // `api/stripe-webhook.js`'s own `getRawBody()` looks for.
              const isRawBodyEndpoint = endpoint === '/api/stripe-webhook';

              if (handler) {
                const chunks: Buffer[] = [];
                req.on('data', (chunk: Buffer) => {
                  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                req.on('end', async () => {
                  const rawBody = Buffer.concat(chunks);

                  if (isRawBodyEndpoint) {
                    (req as any).rawBody = rawBody;
                  } else {
                    (req as any).body = {};
                    try {
                      (req as any).body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
                    } catch {
                      (req as any).body = {};
                    }
                  }

                  (res as any).status = (code: number) => {
                    res.statusCode = code;
                    return res;
                  };
                  (res as any).json = (data: any) => {
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
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Internal server error';
              console.error(`Dev API Loader Error [${endpoint}]:`, err);
              if (!res.writableEnded) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: message }));
              }
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