import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('Syncing Zero Waste Festival event and batch drop...');

  // 1. Ensure product has Zero Waste Festival tagline
  const product = await prisma.product.findFirst({
    where: { sku: 'UX-SLOWBLOOM' },
  });

  if (product) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        tagline: '2026 RESET x Zero Waste Festival',
        description:
          'Slow Bloom — the curated 2026 RESET x Zero Waste Festival modular textile kit. 22 interlocking pieces cut from rescued deadstock materials, Melbourne-made.',
      },
    });
    console.log('✓ Updated product tagline for Slow Bloom');

    // 2. Ensure Drop D001 exists
    const drop = await prisma.drop.findFirst({
      where: { productId: product.id, dropCode: 'D001' },
    });
    if (drop) {
      await prisma.drop.update({
        where: { id: drop.id },
        data: {
          madeLocation: 'Melbourne',
          madeYear: 2026,
          status: 'LIVE',
        },
      });
      console.log('✓ Confirmed Drop D001 status is LIVE');
    } else {
      await prisma.drop.create({
        data: {
          productId: product.id,
          dropCode: 'D001',
          totalUnits: 10,
          status: 'LIVE',
          madeLocation: 'Melbourne',
          madeYear: 2026,
          releaseAt: new Date('2026-09-12T00:00:00Z'),
        },
      });
      console.log('✓ Created Drop D001');
    }
  }

  // 3. Upsert Event Zero Waste Festival
  const event = await prisma.event.upsert({
    where: { slug: 'zero-waste-festival-2026' },
    update: {
      title: 'Zero Waste Festival',
      location: 'Fed Square, Melbourne',
      description:
        'Drop-in tile building all day 12pm–6pm, no experience needed. Visit to try out our newly launched virtual playground and go in the raffle draw to win 1 Unstitch\'s latest drop.',
      color: '#6D771A',
      startsAt: new Date('2026-09-12T12:00:00+10:00'),
      endsAt: new Date('2026-09-12T18:00:00+10:00'),
      ctaLabel: 'Learn More',
      ctaUrl: 'https://zerowastevictoria.org.au/zero-waste-festival/activities/',
      raffleEnabled: true,
      raffleButtonLabel: 'Enter the Raffle Draw',
      raffleClosesAt: new Date('2026-10-31T23:59:59+10:00'),
      raffleDrawCopy:
        'Thanks for stopping by the Unstitch stand and exploring our modular textile system today! Your entry into our Zero Waste Festival Raffle Draw is confirmed.',
    },
    create: {
      slug: 'zero-waste-festival-2026',
      title: 'Zero Waste Festival',
      location: 'Fed Square, Melbourne',
      description:
        'Drop-in tile building all day 12pm–6pm, no experience needed. Visit to try out our newly launched virtual playground and go in the raffle draw to win 1 Unstitch\'s latest drop.',
      color: '#6D771A',
      startsAt: new Date('2026-09-12T12:00:00+10:00'),
      endsAt: new Date('2026-09-12T18:00:00+10:00'),
      ctaLabel: 'Learn More',
      ctaUrl: 'https://zerowastevictoria.org.au/zero-waste-festival/activities/',
      raffleEnabled: true,
      raffleButtonLabel: 'Enter the Raffle Draw',
      raffleClosesAt: new Date('2026-10-31T23:59:59+10:00'),
      raffleDrawCopy:
        'Thanks for stopping by the Unstitch stand and exploring our modular textile system today! Your entry into our Zero Waste Festival Raffle Draw is confirmed.',
    },
  });

  console.log(`✓ Event "${event.title}" saved successfully (ID: ${event.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Migration failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
