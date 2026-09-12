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
            }

            if (handler) {
              let bodyStr = '';
              req.on('data', (/** @type {Buffer | string} */ chunk) => {
                bodyStr += chunk;
              });
              req.on('end', async () => {
                /** @type {any} */ (req).body = {};
                try {
                  /** @type {any} */ (req).body = bodyStr ? JSON.parse(bodyStr) : {};
                } catch {
                  /** @type {any} */ (req).body = {};
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