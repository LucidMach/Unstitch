import prisma from './src/lib/prisma.js';
if (!prisma) { console.log('prisma null'); process.exit(0); }
try {
  await prisma.product.findMany({ select: { id: true, imageUrl: true } });
  console.log('CLIENT OK: imageUrl field recognized');
} catch (e) {
  console.log('CLIENT STALE:', e.message.split('\n')[0]);
}
