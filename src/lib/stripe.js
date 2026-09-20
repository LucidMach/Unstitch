import Stripe from 'stripe';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  if (process.env.STRIPE_SECRET_KEY) return;
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
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

loadDotEnv();

const globalForStripe = globalThis;

function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  return new Stripe(secretKey, {
    apiVersion: '2026-08-26.dahlia',
  });
}

// `stripe` is null when STRIPE_SECRET_KEY isn't configured yet (e.g. local
// dev before keys are set up). Callers must check for null and return a
// 503-style error rather than letting this throw deep inside a request.
export const stripe = globalForStripe.stripe ?? createStripeClient();

if (process.env.NODE_ENV !== 'production' && stripe) {
  globalForStripe.stripe = stripe;
}

export default stripe;
