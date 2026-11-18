// scripts/build-workshop-deck.mjs
//
// Turns slide pictures exported from the workshop deck into the files the hub's
// projector view uses: public/assets/workshop/deck/slide-01.webp, slide-02.webp ...
//
//   1. In PowerPoint / Keynote / Google Slides: export the slides as images
//      (PNG or JPG, 1920 x 1080 or larger) into a folder.
//   2. pnpm workshop:deck ~/Downloads/deck-export
//   3. If the number of slides changed, update `count` (and the slide numbers for the
//      countdown and the QR code) in src/lib/constants/workshopDeck.ts, and edit
//      public/assets/workshop/deck/notes.json to match.
//
// The QR code on the "Begin the challenge" slide is drawn by the hub, so leave that box
// empty in the deck (or export the slide without the placeholder).
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const input = process.argv[2];
if (!input || !fs.existsSync(input)) {
  console.error("Usage: pnpm workshop:deck <folder of exported slide images>");
  process.exit(1);
}

const files = fs
  .readdirSync(input)
  .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!files.length) {
  console.error(`No PNG, JPG or WebP images found in ${input}`);
  process.exit(1);
}

const out = path.resolve("public/assets/workshop/deck");
fs.mkdirSync(out, { recursive: true });
for (const old of fs.readdirSync(out)) if (/^slide-\d+\.webp$/.test(old)) fs.unlinkSync(path.join(out, old));

let total = 0;
for (const [i, f] of files.entries()) {
  const name = `slide-${String(i + 1).padStart(2, "0")}.webp`;
  await sharp(path.join(input, f))
    .resize({ width: 1920, height: 1080, fit: "cover" })
    .webp({ quality: 84 })
    .toFile(path.join(out, name));
  total += fs.statSync(path.join(out, name)).size;
}
console.log(`${files.length} slides written to ${out} (${Math.round(total / 1024)} KB).`);
console.log(`Set count: ${files.length} in src/lib/constants/workshopDeck.ts if it changed, and update notes.json.`);
