// src/lib/qrCodeLoader.ts
//
// The qrcode package's own browser bundle (lib/browser.min.js) is raw
// CommonJS (require()/exports, no UMD wrapper) and throws immediately if
// loaded as a classic <script src> tag — only jsdelivr's "+esm" endpoint
// wraps it into something a browser can import directly. Shared by every
// page that renders a QR code client-side (src/pages/passport.astro,
// src/pages/admin/index.astro) so a version bump or CDN change is one
// edit instead of two.
let qrModulePromise: Promise<any> | null = null;

export function loadQrCodeModule() {
  if (!qrModulePromise) {
    // @ts-expect-error — browser-native dynamic import of a fully
    // qualified https:// URL. TypeScript has no way to resolve a module
    // type for a URL specifier like this (it isn't a package name or a
    // relative path), so `astro check`/tsc always flags it as "Cannot
    // find module" even though it resolves fine at runtime.
    qrModulePromise = import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm");
  }
  return qrModulePromise;
}

// Call after a failed load so the next attempt actually retries the CDN
// fetch instead of replaying the same rejected promise.
export function resetQrCodeModule() {
  qrModulePromise = null;
}
