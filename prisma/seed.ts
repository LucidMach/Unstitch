/**
 * Seeds the "Slow Bloom" kit — the confirmed real product theme — so the
 * schema can be exercised end-to-end before the product page UI exists
 * (cost calculator, drops, digital-passport units, delivery zones).
 *
 * The cost inputs below are realistic figures informed by the
 * business-planning numbers shared so far (22-piece kit, $0 rescued
 * material, ~$197 equipment/machine-time cost). Tagline/description copy
 * is still placeholder text — swap it, and any cost input, via the admin
 * cost-calculator UI once that exists, or edit this file directly and
 * re-run it.
 *
 * Run with: pnpm exec tsx prisma/seed.ts
 * (requires `pnpm install` / `prisma generate` to have completed
 * successfully in your own environment — the Prisma Client used here
 * can't be generated inside this sandbox; see the accompanying summary.)
 */
import { prisma } from "../src/lib/prisma.js";
import { computeCostBreakdown } from "../src/lib/costCalculator";

async function main() {
  console.log("Seeding sample data...");

  const archive = await prisma.materialArchiveCard.create({
    data: {
      slug: "reclaimed-curtain-and-polar-fleece",
      title: "Reclaimed curtain & polar fleece",
      originStory: "Rescued textile waste, Melbourne.",
      images: [],
      hidden: true,
    },
  });

  const givingProgram = await prisma.givingProgram.create({
    data: {
      name: "Community Workshop Melbourne",
      type: "community_workshop",
      description: "Free textile workshops for kids.",
      active: true,
    },
  });

  const materialSource = await prisma.materialSource.create({
    data: {
      name: "Reclaimed curtain fabric — Batch 3",
      materialType: "curtain",
      costCents: 0,
      widthCm: 140,
      heightCm: 200,
      wastePercent: 12,
      notes: "Rescued, $0 acquisition cost",
    },
  });

  const tileSizeCm = 9;
  const tilesPerKit = 22;
  const labourMinutes = 20;
  const labourRateCentsPerHour = 3000;
  const equipmentCostCents = 197;
  const designCostCents = 50000;
  const designAmortizationUnits = 40;
  const packagingComponents = [
    { label: "A5 postcard (with passport QR code)", amountCents: 131 },
    { label: "Glassine protective sleeve", amountCents: 30 },
  ];
  const operationsOverheadCents = 200;
  const givingTilesPerKit = 3;

  // Two passes: the giving line item needs an internal per-tile value, and
  // the simplest honest choice is "what a tile actually costs to make" —
  // which we only know after computing the breakdown once without it.
  const firstPass = computeCostBreakdown({
    materialSource: {
      costCents: materialSource.costCents,
      widthCm: materialSource.widthCm,
      heightCm: materialSource.heightCm,
      wastePercent: materialSource.wastePercent,
    },
    tileSizeCm,
    tilesPerKit,
    labourMinutes,
    labourRateCentsPerHour,
    equipmentCostCents,
    designCostCents,
    designAmortizationUnits,
    packagingComponents,
    operationsOverheadCents,
    givingTilesPerKit,
    givingInternalValueCentsPerTile: 0,
  });
  const givingInternalValueCentsPerTile = Math.round(firstPass.costPerTileCents);

  const costCalc = computeCostBreakdown({
    materialSource: {
      costCents: materialSource.costCents,
      widthCm: materialSource.widthCm,
      heightCm: materialSource.heightCm,
      wastePercent: materialSource.wastePercent,
    },
    tileSizeCm,
    tilesPerKit,
    labourMinutes,
    labourRateCentsPerHour,
    equipmentCostCents,
    designCostCents,
    designAmortizationUnits,
    packagingComponents,
    operationsOverheadCents,
    givingTilesPerKit,
    givingInternalValueCentsPerTile,
  });

  const marginCents = 2000;
  const basePriceCents = Math.ceil((costCalc.totalCostCents + marginCents) / 50) * 50;

  const product = await prisma.product.create({
    data: {
      sku: "UX-SLOWBLOOM",
      slug: "slow-bloom",
      name: "Slow Bloom",
      tagline: "Placeholder tagline", // TODO: replace with real copy
      description: "Placeholder description", // TODO: replace with real copy
      materialArchiveCardId: archive.id,
      colourPalette: ["#E8D8C3", "#B7C4A4", "#D98E73"],
      tileMaterial: "Curtain and polar fleece",
      materialRigidity: "Soft / low-rigidity",
      difficultyLevel: "BEGINNER",
      ageRangeMin: 4,
      ageRangeMax: 99,
      kitContents: [{ item: `${tilesPerKit} interlocking pieces` }],
      giftWrapAvailable: true,
      giftMessageAvailable: true,
      basePriceCents,
      currency: "AUD",
      costBreakdown: costCalc.breakdown as unknown as object,
      lastCostCalculationCents: costCalc.totalCostCents,
      givingTilesPerKit,
      givingInternalValueCentsPerTile,
      givingDescription: `Every kit contributes ${givingTilesPerKit} pieces to ${givingProgram.name}.`,
      isActive: true,
    },
  });

  await prisma.productCostRecipe.create({
    data: {
      productId: product.id,
      materialSourceId: materialSource.id,
      tileSizeCm,
      tilesPerKit,
      labourMinutes,
      labourRateCentsPerHour,
      equipmentCostCents,
      equipmentCostNote: "$75/mo membership apportioned per kit",
      designCostCents,
      designAmortizationUnits,
      packagingComponents: packagingComponents as unknown as object,
      operationsOverheadCents,
      givingTilesPerKit,
      givingProgramId: givingProgram.id,
    },
  });

  const totalUnits = 10;
  const drop = await prisma.drop.create({
    data: {
      productId: product.id,
      dropCode: "D001",
      totalUnits,
      status: "LIVE",
      madeLocation: "Melbourne",
      madeYear: 2026,
      releaseAt: new Date(),
    },
  });

  await prisma.unit.createMany({
    data: Array.from({ length: totalUnits }, (_, i) => {
      const editionNumber = i + 1;
      const serial = `UX-D001-${String(editionNumber).padStart(3, "0")}`;
      return {
        serial,
        qrSlug: serial,
        dropId: drop.id,
        productId: product.id,
        editionNumber,
        status: "IN_STOCK" as const,
      };
    }),
  });

  await prisma.deliveryZone.createMany({
    data: [
      {
        name: "Local delivery (0-5km)",
        method: "SELF_DELIVERY",
        minDistanceKm: 0,
        maxDistanceKm: 5,
        pricingMethod: "FLAT",
        feeCents: 300,
        isEstimate: false,
        etaDays: 3,
        active: true,
      },
      {
        name: "Local delivery (5-10km)",
        method: "SELF_DELIVERY",
        minDistanceKm: 5,
        maxDistanceKm: 10,
        pricingMethod: "FLAT",
        feeCents: 500,
        isEstimate: false,
        etaDays: 3,
        active: true,
      },
      {
        name: "Australia Post — beyond 10km",
        method: "AUSPOST",
        minDistanceKm: 10,
        maxDistanceKm: null,
        pricingMethod: "DYNAMIC",
        feeCents: 1675,
        isEstimate: true,
        etaDays: 6,
        active: true,
      },
      {
        name: "Pickup / drop-box (coming soon)",
        method: "PICKUP",
        minDistanceKm: null,
        maxDistanceKm: null,
        pricingMethod: "FLAT",
        feeCents: 0,
        isEstimate: false,
        etaDays: 0,
        active: false,
      },
    ],
  });

  console.log(`Seeded product "${product.name}" (${product.sku})`);
  console.log(
    `Cost calculator: ${costCalc.effectiveTilesPerSheet} tiles/sheet, total cost $${(
      costCalc.totalCostCents / 100
    ).toFixed(2)}/kit, price $${(basePriceCents / 100).toFixed(2)}`,
  );
  console.log(`Seeded drop ${drop.dropCode} with ${totalUnits} units`);
  console.log("Seeded 4 delivery zones.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
