import prisma from './src/lib/prisma.js';
try {
  await prisma.product.findMany({ select: { id: true, imageUrl: true } });
  console.log('CLIENT OK');
} catch (e) {
  console.log('FULL ERROR:', e.message);
}
