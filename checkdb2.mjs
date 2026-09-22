import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const m = env.match(/DATABASE_URL="([^"]+)"/);
const sql = neon(m[1]);
try {
  const products = await sql`SELECT id, slug, name FROM products`;
  console.log('PRODUCTS:', JSON.stringify(products, null, 2));
  const drops = await sql`SELECT id, drop_code, status, total_units, product_id FROM drops`;
  console.log('DROPS:', JSON.stringify(drops, null, 2));
  const units = await sql`SELECT count(*) FROM units`;
  console.log('UNIT COUNT:', JSON.stringify(units));
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='products'`;
  console.log('PRODUCT COLUMNS:', cols.map(c=>c.column_name).join(', '));
} catch (e) {
  console.error('ERROR:', e.message);
}
