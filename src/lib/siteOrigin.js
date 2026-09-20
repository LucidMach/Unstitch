/**
 * Resolves the site origin to build absolute URLs (Checkout success/cancel
 * URLs, order magic-links) from. Shared by any server-side code that needs
 * one, whether or not a request object is available (a webhook handler,
 * for instance, has no browser request to read an Origin header from).
 */
export function getSiteOrigin(req) {
  const envOrigin = process.env.PUBLIC_SITE_URL;
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  const headerOrigin = req?.headers?.origin;
  if (headerOrigin) return headerOrigin.replace(/\/$/, '');
  return 'https://www.unstitchx.com';
}
