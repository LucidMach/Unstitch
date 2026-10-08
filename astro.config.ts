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

const API_ROUTES: Record<string, string> = {
  '/api/subscribe': './src/server/subscribe.ts',
  '/api/contact': './src/server/contact.ts',
  '/api/share': './src/server/share.ts',
  '/api/create-checkout-session': './api/create-checkout-session.ts',
  '/api/stripe-webhook': './api/stripe-webhook.ts',
  '/api/order-status': './src/server/order-status.ts',
  '/api/admin/login': './src/server/admin/login.ts',
  '/api/admin/logout': './src/server/admin/logout.ts',
  '/api/admin/orders': './src/server/admin/orders.ts',
  '/api/admin/product': './src/server/admin/product.ts',
  '/api/admin/send-email': './src/server/admin/send-email.ts',
  '/api/admin/inventory': './src/server/admin/inventory.ts',
  '/api/admin/manual-order': './src/server/admin/manual-order.ts',
  '/api/admin/customers': './src/server/admin/customers.ts',
  '/api/admin/events': './src/server/admin/events.ts',
  '/api/admin/batch-drops': './src/server/admin/batch-drops.ts',
  '/api/admin/settings': './src/server/admin/settings.ts',
  '/api/admin/broadcast': './src/server/admin/broadcast.ts',
  '/api/unsubscribe': './src/server/unsubscribe.ts',
  '/api/events': './src/server/events.ts',
  '/api/order-lookup-request': './src/server/order-lookup-request.ts',
  '/api/order-lookup': './src/server/order-lookup.ts',
  '/api/order-lookup-by-number': './src/server/order-lookup-by-number.ts',
  '/api/delivery-quote': './src/server/delivery-quote.ts',
  '/api/drop-status': './src/server/drop-status.ts',
  '/api/passport': './src/server/passport.ts',
  '/api/passport-confirm-transfer': './src/server/passport-confirm-transfer.ts',
};

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

          if (!req.url || !req.url.startsWith('/api/')) {
            return next();
          }

          const endpoint = req.url.split('?')[0].replace(/\/$/, '');
          const targetFile = API_ROUTES[endpoint];

          if (!targetFile) {
            return next();
          }

          // Read body stream synchronously before any async operations
          // to prevent dropping chunks or missing 'end' events in Node.js
          const isNoBodyMethod = req.method === 'GET' || req.method === 'HEAD';
          let bodyPromise: Promise<Buffer>;

          if (isNoBodyMethod || req.readableEnded) {
            bodyPromise = Promise.resolve(Buffer.alloc(0));
          } else {
            bodyPromise = new Promise<Buffer>((resolve, reject) => {
              const chunks: Buffer[] = [];
              req.on('data', (chunk: Buffer) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              });
              req.on('end', () => resolve(Buffer.concat(chunks)));
              req.on('error', reject);
              if (req.readableEnded) {
                resolve(Buffer.concat(chunks));
              }
            });
          }

          try {
            const fullPath = path.resolve(process.cwd(), targetFile);
            let handler: any;
            if (typeof server.ssrLoadModule === 'function') {
              const mod = await server.ssrLoadModule(fullPath);
              handler = mod.default || mod;
            } else {
              handler = (await import(/* @vite-ignore */ `${fullPath}?t=${Date.now()}`)).default;
            }

            if (!handler) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `Handler not found in ${targetFile}` }));
              return;
            }

            const rawBody = await bodyPromise;
            const isRawBodyEndpoint = endpoint === '/api/stripe-webhook';

            if (isRawBodyEndpoint) {
              req.rawBody = rawBody;
            } else {
              req.body = {};
              try {
                req.body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
              } catch {
                req.body = {};
              }
            }

            res.status = (code: number) => {
              res.statusCode = code;
              return res;
            };
            res.json = (data: any) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
              return res;
            };

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