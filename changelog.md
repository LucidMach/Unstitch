# Changelog

All notable changes to the **Unstitch** repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-09-10

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
- `api/subscribe.js`: Vercel serverless function for newsletter signups with email validation, duplicate protection, and optional `@vercel/postgres` persistence.
- `api/contact.js`: Vercel serverless function for contact submissions with subject validation, dynamic `details` JSON extraction, PostgreSQL storage, and Resend email dispatch.

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
