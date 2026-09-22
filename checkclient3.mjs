import prisma from './src/lib/prisma.js';
try {
  await prisma.product.findMany({ select: { id: true, imageUrl: true } });
  console.log('CLIENT OK: imageUrl recognized');
} catch (e) {
  console.log('CLIENT ERROR:', e.message.slice(0, 300));
}
try {
  const cols = await prisma.unit.findMany({ where: { status: 'VOID' }, take: 1 });
  console.log('VOID enum OK, sample:', JSON.stringify(cols));
} catch (e) {
  console.log('VOID ERROR:', e.message.slice(0, 300));
}
