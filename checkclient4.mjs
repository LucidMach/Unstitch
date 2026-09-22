import prisma from './src/lib/prisma.js';
try {
  await prisma.product.findMany({ select: { id: true, imageUrl: true } });
  console.log('imageUrl: OK');
} catch (e) { console.log('imageUrl: STALE -', e.message.split('\n').pop()); }
try {
  await prisma.unit.findMany({ where: { status: 'VOID' }, take: 1 });
  console.log('VOID enum: OK');
} catch (e) { console.log('VOID enum: STALE -', e.message.split('\n').pop()); }
try {
  await prisma.payment.findMany({ where: { provider: 'MANUAL' }, take: 1 });
  console.log('MANUAL provider: OK');
} catch (e) { console.log('MANUAL provider: STALE -', e.message.split('\n').pop()); }
