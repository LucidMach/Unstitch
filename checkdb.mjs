import prisma from './src/lib/prisma.js';
if (!prisma) { console.error('prisma is null - no DATABASE_URL found'); process.exit(1); }
try {
  const products = await prisma.product.findMany({ select: { id: true, slug: true, name: true } });
  console.log('PRODUCTS:', JSON.stringify(products, null, 2));
  const drops = await prisma.drop.findMany({ select: { id: true, dropCode: true, status: true, totalUnits: true, productId: true } });
  console.log('DROPS:', JSON.stringify(drops, null, 2));
  const unitCount = await prisma.unit.count();
  console.log('UNIT COUNT:', unitCount);
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
