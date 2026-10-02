/**
 * Client-side "bag" state — browser only, backed by localStorage.
 *
 * IMPORTANT: this does NOT reserve real stock. It's a front-end
 * placeholder so the Add to Bag / cart-drawer UX can be built and tested
 * before the real cart/checkout backend exists. The actual anti-oversell
 * reservation logic already lives in `src/lib/inventory.js` (row-locked
 * `FOR UPDATE SKIP LOCKED` against the `units` table) — once checkout is
 * built, adding to bag should call a real `/api/cart` endpoint backed by
 * that logic instead of writing to localStorage. Until then, the
 * `maxQty` cap on each item is just the batch size, not a live stock
 * count, so don't treat what's in here as authoritative.
 */

export interface CartItem {
  id: string;
  name: string;
  priceCents: number;
  image: string;
  qty: number;
  /** Batch size cap, not a live stock count — see file header note. */
  maxQty: number;
}

const STORAGE_KEY = "unstitch:cart";

/**
 * Checkout-in-progress prefs (delivery postcode + gift message) — kept
 * separately from the cart items themselves. These live only in the
 * cart drawer's in-memory DOM state otherwise, so clicking through to
 * Stripe and then back ("back to store", or the browser back button)
 * reloads the page fresh and wipes them. Persisting them here means
 * they're still filled in when the drawer re-renders after that trip.
 */
export interface CheckoutPrefs {
  postcode: string;
  giftWrap: boolean;
  giftMessage: string;
}

const CHECKOUT_PREFS_KEY = "unstitch:checkout-prefs";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getCart(): CartItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]): CartItem[] {
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can throw (private mode, quota, disabled) — cart just
      // won't persist across reloads in that case, which is an
      // acceptable degrade for a front-end-only placeholder.
    }
    window.dispatchEvent(new CustomEvent<{ items: CartItem[] }>("cart:updated", { detail: { items } }));
  }
  return items;
}

export function addToCart(item: Omit<CartItem, "qty"> & { qty?: number }): CartItem[] {
  const items = getCart();
  const addQty = Math.max(1, item.qty ?? 1);
  const existing = items.find((i) => i.id === item.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + addQty, existing.maxQty);
  } else {
    items.push({
      id: item.id,
      name: item.name,
      priceCents: item.priceCents,
      image: item.image,
      maxQty: item.maxQty,
      qty: Math.min(addQty, item.maxQty),
    });
  }
  return saveCart(items);
}

export function setQuantity(id: string, qty: number): CartItem[] {
  const items = getCart();
  const existing = items.find((i) => i.id === id);
  if (!existing) return items;
  if (qty <= 0) return removeFromCart(id);
  existing.qty = Math.min(qty, existing.maxQty);
  return saveCart(items);
}

export function removeFromCart(id: string): CartItem[] {
  return saveCart(getCart().filter((i) => i.id !== id));
}

/**
 * Empties the bag entirely — used once checkout has actually succeeded
 * (see /order/success), so a completed purchase doesn't linger in the bag
 * for the customer to accidentally buy again.
 */
export function clearCart(): CartItem[] {
  return saveCart([]);
}

export function getCheckoutPrefs(): CheckoutPrefs {
  const empty: CheckoutPrefs = { postcode: "", giftWrap: false, giftMessage: "" };
  if (!isBrowser()) return empty;
  try {
    const raw = window.localStorage.getItem(CHECKOUT_PREFS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      postcode: typeof parsed.postcode === "string" ? parsed.postcode : "",
      giftWrap: !!parsed.giftWrap,
      giftMessage: typeof parsed.giftMessage === "string" ? parsed.giftMessage : "",
    };
  } catch {
    return empty;
  }
}

export function saveCheckoutPrefs(prefs: CheckoutPrefs): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CHECKOUT_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Same acceptable degrade as saveCart — just won't persist this trip.
  }
}

/**
 * Called once an order actually completes (see /order/success) so the
 * next purchase starts with a clean postcode/gift message rather than
 * carrying over the last order's details.
 */
export function clearCheckoutPrefs(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(CHECKOUT_PREFS_KEY);
  } catch {
    // no-op
  }
}

export function cartCount(items: CartItem[] = getCart()): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function cartSubtotalCents(items: CartItem[] = getCart()): number {
  return items.reduce((sum, i) => sum + i.qty * i.priceCents, 0);
}

export function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
