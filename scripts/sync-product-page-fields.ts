// scripts/sync-product-page-fields.ts
//
// One-time migration: src/pages/shop.astro is switching from a hardcoded
// `const product = {...}` object to reading these same fields live from
// the database (see src/server/drop-status.js + the new admin "Product"
// tab, src/server/admin/product.js). Some of those fields already exist
// on the Product row, but were seeded with placeholder values that don't
// match what the live shop page has actually been showing — this script
// brings the database in line with the current live page so the switch
// to dynamic data doesn't change what customers see.
//
// Fields intentionally NOT touched here because they're already correctly
// live-managed elsewhere and this script shouldn't risk clobbering a
// since-changed admin edit: name, tagline, basePriceCents (Pricing tab),
// Drop.dropCode / Drop.totalUnits (Inventory / Batch Drops tabs).
//
// Safe to run more than once (idempotent — just sets the same values).
// Run once via: npx tsx scripts/sync-product-page-fields.ts

import { prisma } from '../src/lib/prisma.js';

const SLUG = 'slow-bloom';

async function main() {
  console.log('Syncing shop.astro\'s current static product-page content into the database...');

  const product = await prisma.product.findUnique({ where: { slug: SLUG } });
  if (!product) {
    console.error(`No product found with slug "${SLUG}" — nothing to sync.`);
    process.exit(1);
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      colourPalette: ['#383433', '#90c4c4', '#002644'],
      // Stored newline-separated going forward (see the new admin Product
      // tab's "Feel" field) — rendered as two stacked lines on the shop
      // page, same as the old hardcoded `feel: ["Soft", "Low-rigidity"]`.
      materialRigidity: 'Soft\nLow-rigidity',
      ageRangeMin: 4,
      ageRangeMax: 200,
      // Matches the old hardcoded `included` array's labels exactly (see
      // git history of shop.astro) — icons are resolved client-side by
      // label, not stored here.
      kitContents: [
        '3 Designs',
        'Wrap Build Mat',
        'Unstitch Mail',
        'Tiles',
        'x3 Tile for Change',
        'Product Passport',
        'Gift Message (optional)',
      ],
    },
  });

  console.log('✓ Synced Product fields:');
  console.log('  colourPalette:', updated.colourPalette);
  console.log('  materialRigidity:', JSON.stringify(updated.materialRigidity));
  console.log('  ageRangeMin / ageRangeMax:', updated.ageRangeMin, '/', updated.ageRangeMax);
  console.log('  kitContents:', updated.kitContents);
  console.log('\nNot touched (already correctly live-managed): name, tagline, basePriceCents, Drop.dropCode, Drop.totalUnits.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Sync failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
