/**
 * Order number generator — shared by every order-creation path (Stripe
 * webhook, manual admin orders) so "UX-2026-000123" means the same thing
 * regardless of how the order was created.
 */
export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `UX-${year}-${rand}`;
}
