# Changelog

All notable changes to the **Unstitch** repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-09-23

Today's work: a CI fix, two security fixes, a six-part performance pass, a large test-coverage expansion, and the merge/cleanup that followed bringing all three branches together.

### Fixed
- **CI**: excluded the repo-root throwaway verify scripts (`checkclient*.mjs`, `checkdb*.mjs`, `stripetest.mjs`) from typecheck, and silenced a QR-code CDN import error surfaced by `astro check` in `src/pages/admin/index.astro`. (`tsconfig.json`, `src/pages/admin/index.astro`) — `d1103e5`.
- **Stored XSS in the admin panel** (High severity): the admin panel rendered customer-supplied data (e.g. a Stripe checkout billing name) straight into `innerHTML` with no escaping — a crafted name such as `<img src=x onerror=...>` would execute in the admin's browser session on next page load, a full admin-session-hijack vector reachable from a normal customer purchase. Imported the existing `esc()` helper (`src/lib/emailTemplate.js`) into the admin page's inline script and wrapped every dynamic interpolation site that reaches `innerHTML`: orders table rows (customer name/email, internal-note title attribute), order detail summary, order items list, payments list, customers table rows, and drops/inventory cards (unit serial, product image `src`/`alt`, product name, drop code). (`src/pages/admin/index.astro`) — `14f82c2`.
- **Passport re-registration hijack** (Medium severity): `api/passport.js` let anyone who knew (or sequentially guessed) a unit's serial silently overwrite an existing registration — reassigning ownership and exposing the current registrant's name to an anonymous request. First-time registration and same-email self-updates stay as immediate direct writes; a transfer to a *different* email now mints a signed, expiring (7-day) token via `src/lib/signedToken.js` and emails it to the **current** registrant instead of applying immediately — the POST responds `409 { pending: true }` and mutates nothing. New `api/passport-confirm-transfer.js` verifies the token and re-checks the unit's current owner before completing the reassignment; new `src/pages/passport/confirm.astro` consumes it client-side; new `passportTransferConfirmationEmail()` added to `src/lib/emailTemplate.js`. The public `GET /api/passport` (QR-scan lookup) no longer loads or returns `registeredOwnerName` at all. New `tests/api/passport.test.ts` (329 lines) covers first-registration, self-update, cross-email transfer (409 + exactly one email, no mutation), and the confirm-transfer token's valid/expired/tampered/wrong-`kind`/stale-reassignment cases. — `14f82c2`.

### Performance
Six independent fixes from the backend performance audit, covering everything added since `82c0780`:
- **DB indexes**: added `@@index([customerId])` and `@@index([createdAt])` to the `Order` model in `prisma/schema.prisma`, backing the admin customers list's per-customer aggregation and any created-at ordering/filtering. Requires a manual `pnpm db:push` against the target database — deliberately not run automatically since this repo has no migrations folder.
- **`api/admin/customers.js`**: replaced JS-side aggregation (loading every customer with a nested `orders` relation and reducing in memory) with a single `prisma.order.groupBy({ by: ['customerId'], _count, _sum })`; response shape unchanged.
- **`api/create-checkout-session.js`**: collapsed the sequential `product.findUnique` → `drop.findFirst` pair into one query with an `include` for the live drop; `resolveDeliveryZone()` and `reserveUnitsForDrop()` (independent of each other) now run via `Promise.allSettled` instead of sequentially, with `releaseIfReserved()` handling the case where one fails after the other already reserved stock.
- **`api/admin/inventory.js`**: `GET` now excludes `ARCHIVED` drops by default instead of loading the full drop history every time.
- **Admin panel single-row DOM patching**: `src/pages/admin/index.astro` — extracted `renderOrderRow`/`bindOrderRow` and `renderCustomerRow`/`bindCustomerRow` from the existing list-building logic, and added `patchOrderRow`/`patchCustomerRow` so the four order-detail actions (mark-paid, update-ship-date, update-order-details, mark-shipped) and the customer-save flow patch one table row instead of refetching and re-rendering the entire list (up to 200 orders / 500 customers) on every save; falls back to a full reload if the target row isn't found. `api/admin/orders.js`'s mutating handlers now include the customer's email/name in their response so the patched row has what it needs. Every interpolated value in the new render functions is wrapped in `esc()`, independent of the admin-security branch's own escaping pass.
- **Hero image**: moved `public/SlowBloom.png` to `src/assets/SlowBloom.png` and switched every reference (`src/pages/index.astro`, `shop.astro`, `shop-all.astro`) to Astro's `astro:assets` pipeline (`<Image>` / `getImage()`), including the two non-`<img>` contexts (Layout's OG/Twitter `image` prop, the bag drawer's `data-product-image` attribute). The PNG (133KB) now ships as a deduplicated WebP (~17KB, ~87% smaller) shared across all four references. Added `sharp` as an explicit direct dependency (already transitively present via Astro) so pnpm's strict `node_modules` layout resolves it during the build-time image pipeline.

`dccc6f7` — verified with `pnpm astro check` (0 errors), `pnpm build`, and the existing `pnpm test` suite (63/63, unchanged on this branch).

### Added
- **Test coverage expansion**: 16 new test files (~116 new tests, taking the suite from 88 to 204 tests) covering the ecommerce backend build-out, which previously had only `costCalculator.test.ts`:
  - Auth/token core: `tests/lib/signedToken.test.ts`, `tests/lib/adminAuth.test.ts`.
  - Payment-critical paths: `tests/api/stripe-webhook.test.ts` (signature verification against the real Stripe SDK rather than a mock, idempotency on repeated `Payment.providerPaymentId`, unit release on `checkout.session.expired`), `tests/api/create-checkout-session.test.ts`.
  - Order lookup and admin authorization: `tests/api/order-lookup.test.ts`, `tests/api/order-lookup-request.test.ts`, `tests/api/admin-authz.test.ts` (a parametrized regression guard hitting every `api/admin/*.js` handler with no/tampered session cookies, asserting 401 and zero Prisma write calls).
  - Pure business-logic libs: `tests/lib/deliveryZones.test.ts`, `tests/lib/shipping.test.ts`, `tests/lib/orderNumber.test.ts`, `tests/lib/inventory.test.ts`, `tests/lib/emailTemplate.test.ts`.
  - Deeper admin CRUD coverage: `tests/api/admin-inventory.test.ts`, `tests/api/admin-manual-order.test.ts`, `tests/api/admin-product.test.ts`, `tests/api/admin-send-email.test.ts`.
  - No source files under `api/`, `src/lib/`, or `src/pages/` were touched — tests only. `9e9c813`.

### Merged
- `perf/backend-hotpaths` (`6c587be`) and `test/coverage-expansion` (`1fd1578`) branches merged in, bringing together the security fixes, performance pass, and test coverage above. The performance merge resolved a conflict in `src/pages/admin/index.astro` between the security branch's escaping pass and the performance branch's row-patching refactor of the same file; neither merge commit carries independent content beyond its source branch.

### Fixed (post-merge)
- Test/implementation mismatches surfaced by merging the security, performance, and test-coverage branches (`6168955`): updated `tests/api/create-checkout-session.test.ts`'s mocks for the performance branch's collapsed single-query product/drop lookup (now returns `product.drops` instead of a separate `drop.findFirst`); mocked `node:fs` in `tests/api/stripe-webhook.test.ts` so its "missing env var" tests aren't silently defeated by a local `.env.local` fallback in `src/lib/stripe.js`/`src/lib/prisma.js`; added non-null assertions in `tests/lib/signedToken.test.ts` so `astro check` passes on `verify()`'s `Record<string, any> | null` return type. Full suite: 216/216 tests passing, 0 typecheck errors, build succeeds.

---

## [Unreleased] - 2026-09-22

### Added — Full ecommerce admin backend
- **Admin CRUD endpoints**: `api/admin/customers.js` (list with derived order count/lifetime spend, per-customer detail, update), `api/admin/inventory.js` (315 lines — restock with lowest-unused-edition-number gap-filling, void/undo-void/delete-void, release-stale-reservations), `api/admin/manual-order.js` (453 lines — off-platform/commission order entry), and substantial expansions to `api/admin/orders.js` and `api/admin/send-email.js`.
- **Delivery-zone-aware shipping quotes**: `src/lib/deliveryZones.js` (postcode-to-zone resolution for Melbourne-area self-delivery, restricted to Victorian postcodes 3000-3999/8000-8999, falling back to an Australia Post zone), `src/lib/shipping.js`, and the public `api/delivery-quote.js` endpoint (read-only estimate; the real charge is always re-resolved server-side at checkout).
- **HTML email templates**: `src/lib/emailTemplate.js` (288 lines) — branded transactional email templates (order confirmation, shipped, etc.) with an `esc()` escaping helper.
- **Digital passport feature**: `api/passport.js` (public `GET` by serial for the QR-scan customer-facing lookup, `POST` to register/claim a kit), `src/pages/passport.astro` (391 lines).
- **Drop-status endpoint**: `api/drop-status.js` — public, read-only live stock-status lookup (`available`/`status`/`inStock`) so static pages can reflect real sold-out state without per-request server rendering; the actual oversell-prevention check still happens in `create-checkout-session.js`.
- `src/lib/orderNumber.js`; expanded `src/lib/inventory.js`.
- `public/SlowBloom.png` product photo.
- `vercel.json` gained an 8-line config block.
- Repo-root throwaway verification scripts used during development: `checkclient.mjs`–`checkclient4.mjs`, `checkdb.mjs`, `checkdb2.mjs`, `stripetest.mjs` (later excluded from typecheck in `d1103e5`).

### Changed
- `api/create-checkout-session.js`, `api/stripe-webhook.js`: extended to drive the full order/inventory/email flow (114+ new lines in the webhook alone).
- `src/pages/admin/index.astro`: grew by roughly 1,184 lines into a full admin panel covering customers, inventory, manual orders, and orders.
- `src/pages/shop.astro`, `src/pages/legal.astro`, `src/components/CartDrawer.astro`, `prisma/schema.prisma`, `src/styles/brand.css`: extended to support the above.

`196175f` — 33 files changed, 4,223 insertions.

---

## [Unreleased] - 2026-09-16 to 2026-09-20

The commit message for this one ("Remove superseded .ts files") undersells its scope — this is the commerce-backend foundation commit.

### Added
- **Prisma commerce schema + seed script**: `prisma/schema.prisma` grew by 678 lines to the full commerce domain model (products, drops, units, orders, order items, customers, payments, reviews, delivery zones, etc.); `prisma/seed.ts` (299 lines) seeds it.
- **Cost calculator**: `src/lib/costCalculator.js` (177 lines) with its first test coverage, `tests/lib/costCalculator.test.ts`.
- **Stripe checkout + webhook (first version)**: `api/create-checkout-session.js` (130 lines), `api/stripe-webhook.js` (287 lines), `src/lib/stripe.js`.
- **Admin login/session auth**: `src/lib/adminAuth.js`, `src/lib/signedToken.js`, `api/admin/login.js`, `api/admin/logout.js`.
- **First-cut admin panel**: `src/pages/admin/index.astro` (535 lines), `src/pages/admin/login.astro`, plus `api/admin/orders.js`, `api/admin/product.js`, `api/admin/send-email.js`.
- **Order lookup**: `api/order-lookup.js`, `api/order-lookup-request.js`, `api/order-status.js`, `src/pages/order/{lookup,success,cancelled}.astro`.
- **Cart drawer**: `src/components/CartDrawer.astro` (192 lines), `src/lib/cart-client.ts`.
- Supporting libs: `src/lib/inventory.js`, `src/lib/siteOrigin.js`, `src/lib/schemas/checkout.js`.
- **Legal page**: `src/pages/legal.astro` (546 lines).
- **Brand styles**: `src/styles/brand.css` extended by 217 lines.
- `.env.example` documenting required environment variables.
- `src/pages/shop-all.astro` (217 lines): full catalog listing page.

### Development history (folded in from the removed `.patch` files)
Three commits behind this feature work were originally produced in a separate Claude Code cloud session and exported as `git format-patch` files (`0001-...patch`, `0002-...patch`, `0003-...patch`) that sat in the repo root — their own commit hashes don't exist in this repo's history, but their equivalent code shipped here as part of `47a22ac`. Their commit-message descriptions are preserved below as the detailed development record, then the patch files themselves were deleted:

1. **Add Slow Bloom product page, bag drawer, and commerce schema**
   - `/shop` became the Slow Bloom product page: specs, what's included, quantity capped at the 10-kit batch, add-to-bag, reviews empty state.
   - Slide-in bag drawer + header bag icon (front-end-only cart at this stage; checkout stayed disabled until Stripe was wired up).
   - Homepage countdown auto-reveals the Latest Drop section at release time.
   - Initial Prisma commerce schema, cost calculator (with tests), reservation logic, and a `db:seed` script.

2. **Fix countdown-reveal bug; refine product page, reviews, mobile bag**
   - Fixed a bug where the live drop never revealed itself for visitors arriving after release: `clearInterval` ran before the timer variable was initialised, throwing on the first synchronous tick (the same latent bug was also fixed in `shop-countdown.astro`).
   - Kit specs laid out side-by-side with vertical dividers, per the wireframe.
   - Reviews section moved above the archive teaser, with a "Write a review" button and modal (title, comment, three category ratings, recommend checkbox, passport-code/edition-number opt-in); the `Review` Prisma model gained `ratingPlay`/`ratingBuild`/`ratingValue`/`wouldRecommend` fields.
   - Bag added to the mobile bottom nav with a count badge; the Shop icon changed to a tag so it's no longer visually identical to the bag icon.

3. **Match icons across breakpoints, fix bag icon shape, homepage layout**
   - Bag and menu icons made identical on desktop and mobile (same even-line hamburger, same folded-top shopping-bag glyph — the previous tote-with-loop-handle read as a bucket/trash can at icon size, even at its original larger size).
   - Homepage "Latest Drop": floral illustration became a decorative backdrop behind the section instead of painted onto the hero-image placeholder itself; eyebrow/title/subtitle left-aligned while the hero image and buttons stay centred; the same backdrop treatment was applied to the product page's hero image for consistency.
   - "Add to Bag" changed from the accent colour to black (`btn-filled--black`) on both the homepage reveal and the product page.

`47a22ac` — 46 files changed, 11,189 insertions, 353 deletions.

---

## [Unreleased] - 2026-09-14 to 2026-09-16

### Changed
- `src/pages/shop.astro`, `src/pages/index.astro`: live-event countdown timer target date adjusted three times as the festival drop schedule shifted — `378509b` ("Ah, just couldn't make ecommerce fast enough"), `3cbede1` (updated to Wednesday 16th, 6pm), `7f0f6b1`/`cb858d7` (further update).

---

## [Unreleased] - 2026-09-12

### Added
- Homepage GIF/countdown reveal and a playground raffle-draw popup (`c2bef19`, merged via PR #1 "ZWV festival website launch", `58c8de9`).
- New brand imagery: `public/OneTileGif.gif`, `public/assets/contact-banner.png`, and `public/assets/home/{countdown-reset,custom-owl,learn-workshop,learn-workshop-setup,shop-tote}.webp`.
- SEO pass: `public/robots.txt`, `public/site.webmanifest`, `src/pages/sitemap.xml.ts`, and meta tags added across every page (`82c0780`, "[SEO] basic optimisations and raffle stuff for the festival").
- `api/subscribe.js` (first version, pre-Prisma-migration — a standalone Neon-backed newsletter subscribe endpoint, later superseded by the Prisma-based version in the 2026-09-10 entry above) plus its first test, `tests/api/subscribe.test.ts`.

### Changed
- `src/pages/shop.astro` repointed to the Slow Bloom drop; Learn/Custom/Archive nav links hidden for the festival launch window (`c2bef19`).
- `src/components/Ticker.astro`, `src/pages/playground.astro`, `src/pages/shop.astro`: mobile/iPad responsiveness fixes to the marquee, playground layout, and shop page (`91af79c`, "[Responsiveness] fixing load issues on mobile and ipad").

---

## [Unreleased] - 2026-09-11

### Added
- First test coverage for the playground "share your design" flow: `tests/api/share.test.ts`, `tests/schemas/share.test.ts`.

### Changed
- `api/share.js`, `src/components/playCanvas.tsx`, `src/components/ui/Dialogs.tsx`, `src/lib/schemas/share.js`: reduced the image size/payload sent through the Resend-emailed playground share flow (`8fde784`, "[Optimisation] image size for resend playground").

---

## [Unreleased] - 2026-09-10

### Added
- **Prisma ORM on top of Neon PostgreSQL**:
  - `prisma/schema.prisma`: Data models for `Subscriber` and `ContactSubmission` mapped to PostgreSQL tables (`subscribers`, `contact_submissions`).
  - `prisma.config.ts`: Prisma configuration for Neon connection pooling.
  - `src/lib/prisma.js`: Singleton Prisma Client utilizing `@prisma/adapter-neon` serverless WebSocket adapter with global caching and `.env.local` fallback.
  - Updated `api/subscribe.js` and `api/contact.js` to use Prisma Client queries (`upsert`, `create`) with strict schema validation.
  - Added Prisma CLI scripts to `package.json`: `postinstall`, `db:generate`, `db:push`, `db:studio`.

### Summary
Comprehensive comparison, contrast analysis, and integration of the brand assets, multi-page website architecture, and serverless backend functions contributed by Yi Jing Ang (`be1a8e736dd171f83a6fa3b2fc8b3edbcb034d3a` & `aa123265941c5d0d4f6aef91ff25a4941b0c0ab4`) into the existing **Astro 6 + React 19 + Three.js** application.

---

### Compare & Contrast Analysis

| Dimension | Existing System (Before `be1a8e7`) | New Member's Work (`be1a8e7` & `aa12326`) | Integrated Result |
| :--- | :--- | :--- | :--- |
| **Framework & Tech Stack** | Astro 6, React 19, Tailwind CSS v4, Three.js / R3F, GSAP, Jotai | Static `.html` files, Vanilla CSS (`styles.css`), Vanilla JS (`script.js`), Vercel serverless | Unified Astro 6 component architecture with React 19 client islands for 3D simulation |
| **Routing & Structure** | 3 routes (`/`, `/playground`, `/coming-soon`) | 8 static HTML pages in `src/pages/` (`index.html`, `about.html`, etc.) | Full clean routing: `/`, `/about`, `/learn`, `/custom`, `/shop`, `/shop-countdown`, `/archive`, `/contact`, `/playground` |
| **Navigation & Chrome** | Experimental 4-card diagonal GSAP fly-in overlay | Sticky header with scroll condensation, mobile bottom nav, off-canvas menu sheet | Sticky header with scroll condensation, responsive 4-tab mobile bar, off-canvas menu drawer, floating mascot widget |
| **Visual Identity** | Minimal raw layout | Full brand identity: Space Grotesk typography, Opera Mauve palette, custom SVG mascot cursor, zigzag stitch dividers | Brand tokens consolidated into `src/styles/brand.css` and applied across all routes |
| **3D Textile Engine** | Parametric 3D textile folding engine with GLTF loading, version history, and ghost state controls | Static image placeholders with external link to `unstitchx.com/playground` | Fully integrated at `/playground` with back navigation to the main studio |
| **Backend & APIs** | None | Standalone serverless JS files | Standard Vercel serverless functions in `api/subscribe.js` and `api/contact.js` |

---

### Added

#### Global Styling & Design Tokens
- `src/styles/brand.css`: Complete brand token system:
  - Color tokens: `--ink` (`#111111`), `--paper` (`#ffffff`), `--accent` (`#b784a7` Opera Mauve), `--accent-pale` (`#e9dae5`), `--placeholder` (`#e4e4e4`).
  - Custom SVG mascot cursor with pointer active states.
  - Zigzag stitch SVG polyline divider (`.stitch`).
  - Space Grotesk and Inter Google Fonts.
  - Responsive layouts, buttons, forms, product grids, modal shells, and accordions.

#### Global Components
- `src/components/SiteHeader.astro`: Sticky navigation header that condenses on scroll (>80px) from full wordmark to logomark, revealing quick links and a direct **Play** button linking to `/playground`.
- `src/components/Ticker.astro`: Looping brand marquee (`zero waste • modular puzzle • upcycle textile`) with dynamic track cloning for gap-free scrolling on any viewport.
- `src/components/MenuSheet.astro`: Accessible off-canvas slide-in menu drawer with backdrop blur, keyboard controls (Escape), and full sitemap navigation.
- `src/components/MobileNav.astro`: Fixed 4-tab bottom navigation bar for mobile screens (Home, Shop, Play, More).
- `src/components/MascotButton.astro`: Fixed floating mascot trigger button in the bottom-right corner.
- `src/components/SiteFooter.astro`: Comprehensive site footer with land acknowledgment for the Wurundjeri people of the Kulin Nation, social links, and copyright.

#### New Astro Pages
- `src/pages/about.astro` (`/about`): Studio story sections ("The House of Tiles", "Why the Planned Obsolescence?", "What We Do", "The X-Factory") with newsletter signup.
- `src/pages/learn.astro` (`/learn`): Workshop event carousel with dots and auto-scroll, interlocking module mechanics, 3-panel CSS grid accordion (Schools, Public, Corporate), and partner logos strip.
- `src/pages/custom.astro` (`/custom`): Spatial commissions page with use cases, 5-step interactive methodology, and capability cards.
- `src/pages/shop.astro` (`/shop`): Live collection drop store grid with product cards, pricing, and bag actions.
- `src/pages/shop-countdown.astro` (`/shop-countdown`): Live drop countdown timer with days, hours, minutes, seconds counter, and email alert registration.
- `src/pages/archive.astro` (`/archive`): Rescue Material Files catalog with flip cards (transformed collection vs. raw material), interactive full-screen file modal viewer with keyboard and mobile touch swipe navigation.
- `src/pages/contact.astro` (`/contact`): Multi-category contact enquiry form with URL parameter preselection (`?category=...`), dynamic subject field sets, and async submission.

#### Serverless Backend Endpoints
- `api/subscribe.js`: Vercel serverless function for newsletter signups with email validation, duplicate protection, and `@neondatabase/serverless` (Neon Postgres) persistence.
- `api/contact.js`: Vercel serverless function for contact submissions with subject validation, dynamic `details` JSON extraction, `@neondatabase/serverless` (Neon Postgres) storage, and Resend email dispatch.

#### Licensing & Legal Framework
- `LICENSE`: Established a multi-tier split license structure:
  - **MIT License** for general website shell, styling, and UI components.
  - **Source-Available Non-Commercial & Evaluation License** for the 3D Modeling Playground, parametric geometry calculations, and tile folding engine.
  - **All Rights Reserved** for trademarks, brand logos, 3D GLTF models, and proprietary physical module/bag designs.
- `package.json`: Updated `"license": "SEE LICENSE IN LICENSE"`.
- `README.md`: Added project overview and licensing section.

#### Static Assets
- `public/assets/`: Migrated brand assets (`logo-full.svg`, `logo-mark.svg`, `white-logo-mark.svg`, `mascot.svg`, `floral-pattern.svg`, `favicon-adaptive.svg`, and partner logos for Monash University, Zero Waste Festival, DATTA Vic) for consistent public serving.

---

### Changed
- `src/layouts/Layout.astro`: Refactored into a unified master layout incorporating `brand.css`, `Ticker`, `SiteHeader`, `MenuSheet`, `MobileNav`, `MascotButton`, and `SiteFooter`.
- `src/pages/index.astro`: Transformed homepage to integrate the hero section, Latest Drop product grid, workshop spotlight, studio about blurb, 3-column explore grid, and newsletter subscription form.
- `src/pages/playground.astro`: Preserved the 3D React Three Fiber parametric tile folding engine with added top-left studio back-navigation pill.

---

### Removed
- Removed legacy static HTML, CSS, and JS files from `src/pages/` to prevent Astro routing collisions:
  - `src/pages/index.html`
  - `src/pages/about.html`
  - `src/pages/archive.html`
  - `src/pages/contact.html`
  - `src/pages/custom.html`
  - `src/pages/learn.html`
  - `src/pages/shop.html`
  - `src/pages/shop-countdown.html`
  - `src/pages/styles.css`
  - `src/pages/script.js`
  - `src/pages/contact.js`
  - `src/pages/subscribe.js`
  - `src/pages/vercel.json`

---

### Fixed
- **Accent Color Palette Resolution**: Fixed an issue where `--accent: oklch(0.97 0 0)` in `src/styles/global.css` was overriding the brand's Opera Mauve (`--accent: #b784a7`) due to stylesheet import ordering. Updated `global.css` tokens and ensured `brand.css` takes final precedence in `Layout.astro`.

---

### Verification
- Ran `pnpm build` (`ASTRO_TELEMETRY_DISABLED=1`):
  - **10 static routes** successfully compiled in `6.63s` with zero errors or warnings:
    - `/` (Home)
    - `/about`
    - `/archive`
    - `/coming-soon`
    - `/contact`
    - `/custom`
    - `/learn`
    - `/playground`
    - `/shop`
    - `/shop-countdown`
