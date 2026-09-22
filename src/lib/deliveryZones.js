/**
 * Postcode -> delivery zone resolution for local (self-delivery) shipping.
 *
 * IMPORTANT CAVEAT: this postcode list is a best-effort draft based on
 * general knowledge of Melbourne suburb geography, built from base postcode
 * 3006 (Southbank/South Wharf) — NOT from a geocoded/measured dataset. This
 * sandbox's network is restricted to package registries only (no access to
 * GeoNames or any mapping/geocoding API), so an authoritative distance
 * lookup couldn't be built here. Before relying on this for real charges:
 *   - Sanity-check the two lists below against your actual delivery
 *     experience — you know your real routes better than this list does.
 *   - Anything NOT in either list falls through to the Australia Post
 *     fallback zone (conservative: overcharges rather than undercharges a
 *     borderline suburb).
 *   - If you'd rather this auto-update from a real geocoding API later,
 *     that's a clean swap-in: replace `resolveZoneKeyForPostcode` with an
 *     API call, everything downstream (checkout, webhook) stays the same.
 *
 * Kept as a plain code constant (not the DB's DeliveryZone.postcodePatterns
 * JSON field, even though that field exists for exactly this) so a
 * correction ships with a normal git push, no separate DB script to run.
 */

/** @typedef {'LOCAL_0_5' | 'LOCAL_5_10' | 'AUSPOST'} ZoneKey */

/**
 * Thrown by resolveDeliveryZone for a postcode outside the delivery area
 * (currently: Victoria only — see the "Delivery" answers in the project
 * doc). Callers should catch this specifically and show the customer a
 * "we don't deliver there yet, please contact us" message rather than a
 * generic error, since this isn't a system failure.
 */
export class OutOfDeliveryAreaError extends Error {
  /** @param {string} postcode */
  constructor(postcode) {
    super(`Postcode ${postcode} is outside Victoria — delivery isn't available there yet.`);
    this.name = 'OutOfDeliveryAreaError';
    /** @type {string} */
    this.postcode = postcode;
  }
}

// Victorian postcodes: 3000-3999 (all VIC suburbs) and 8000-8999 (VIC-only
// PO boxes/special postcodes, e.g. Melbourne GPO). Anything outside this
// range is interstate and not currently deliverable at all — not even via
// the AusPost fallback zone, which was only ever meant to cover "further
// away within Victoria than the local self-delivery radius," not
// interstate parcels with real AusPost pricing this business hasn't
// costed or committed to yet.
/** @param {string} postcode @returns {boolean} */
export function isVictorianPostcode(postcode) {
  const n = parseInt(String(postcode || '').trim(), 10);
  if (!Number.isInteger(n)) return false;
  return (n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999);
}

// Roughly 0-5km from Southbank/CBD.
const POSTCODES_0_5KM = new Set([
  '3000', '3002', '3003', '3004', '3006', '3008', // CBD, East/West Melbourne, Southbank, Docklands
  '3051', '3052', '3053', '3054', // North Melbourne, Parkville, Carlton, Carlton North
  '3065', '3066', '3067', // Fitzroy, Collingwood, Abbotsford
  '3121', // Richmond / Cremorne
  '3141', // South Yarra
  '3181', // Prahran / Windsor
  '3205', '3206', '3207', // South Melbourne, Albert Park, Port Melbourne
]);

// Roughly 5-10km from Southbank/CBD.
const POSTCODES_5_10KM = new Set([
  '3011', '3012', // Footscray, Brooklyn/Kingsville
  '3031', '3032', '3039', // Flemington/Kensington, Ascot Vale/Maribyrnong, Moonee Ponds
  '3056', '3057', // Brunswick, Brunswick East
  '3068', '3070', // Clifton Hill, Northcote
  '3101', // Kew
  '3122', '3123', // Hawthorn, Hawthorn East
  '3142', '3143', '3144', // Toorak, Armadale, Malvern
  '3162', // Caulfield / Glen Huntly
  '3182', '3183', '3184', '3185', // St Kilda, St Kilda West, Elwood, Balaclava/St Kilda East
]);

/**
 * @param {string} postcode
 * @returns {ZoneKey}
 */
export function resolveZoneKeyForPostcode(postcode) {
  const normalized = String(postcode || '').trim();
  if (POSTCODES_0_5KM.has(normalized)) return 'LOCAL_0_5';
  if (POSTCODES_5_10KM.has(normalized)) return 'LOCAL_5_10';
  return 'AUSPOST';
}

/**
 * Finds the matching (active) DeliveryZone row for a postcode. Matches by
 * `method` + `maxDistanceKm` rather than a name/code, since that's what the
 * seed data already establishes and needs no schema change.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} postcode
 * @returns {Promise<any | null>}
 * @throws {OutOfDeliveryAreaError} if the postcode is outside Victoria
 */
export async function resolveDeliveryZone(prisma, postcode) {
  if (!isVictorianPostcode(postcode)) {
    throw new OutOfDeliveryAreaError(postcode);
  }

  const zoneKey = resolveZoneKeyForPostcode(postcode);

  const where =
    zoneKey === 'LOCAL_0_5'
      ? { method: 'SELF_DELIVERY', maxDistanceKm: 5, active: true }
      : zoneKey === 'LOCAL_5_10'
        ? { method: 'SELF_DELIVERY', maxDistanceKm: 10, active: true }
        : { method: 'AUSPOST', active: true };

  const zone = await prisma.deliveryZone.findFirst({ where });
  return zone ? { ...zone, zoneKey } : null;
}
