import type { APIRoute } from 'astro';

interface SitemapEntry {
  path: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
  lastmod?: string;
}

const pages: SitemapEntry[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/playground', changefreq: 'weekly', priority: '0.9' },
  { path: '/shop', changefreq: 'weekly', priority: '0.9' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
  { path: '/learn', changefreq: 'monthly', priority: '0.8' },
  { path: '/custom', changefreq: 'monthly', priority: '0.8' },
  { path: '/archive', changefreq: 'monthly', priority: '0.8' },
  { path: '/contact', changefreq: 'monthly', priority: '0.8' },
  { path: '/shop-countdown', changefreq: 'weekly', priority: '0.6' }
];

export const GET: APIRoute = ({ site }) => {
  const baseUrl = (site ? site.toString() : 'https://www.unstitchx.com').replace(/\/+$/, '');
  const today = new Date().toISOString().split('T')[0];

  const xmlUrls = pages
    .map(
      (entry) => `  <url>
    <loc>${baseUrl}${entry.path}</loc>
    <lastmod>${entry.lastmod || today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${xmlUrls}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Robots-Tag': 'noindex'
    }
  });
};
