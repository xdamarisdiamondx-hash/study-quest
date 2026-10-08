/**
 * Generate the PWA icon set from brand/logo-mark.svg (P20).
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs into apps/web/public/icons/:
 *   - icon-192.png, icon-512.png    the mark as designed, rounded tile on transparency
 *   - maskable-512.png              full-bleed violet field with the mark inside the
 *                                   80% safe zone, so any launcher shape crops cleanly
 *   - apple-touch-icon-180.png      full-bleed (iOS masks corners itself)
 *   - favicon-32.png                a raster favicon for browsers that skip SVG favicons
 *
 * The logo is not edited here — this script only rasterises what the brand file
 * already says. Re-run it after changing brand/logo-mark.svg.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "apps", "web", "public", "icons");
const svg = await readFile(join(root, "brand", "logo-mark.svg"));

/** Full-bleed field behind the mark for the shapes that crop away the tile's own corners. */
const field = "#6d28d9";

await mkdir(out, { recursive: true });

// The mark as designed: rounded violet tile, transparent outside it.
await sharp(svg).resize(192, 192).png().toFile(join(out, "icon-192.png"));
await sharp(svg).resize(512, 512).png().toFile(join(out, "icon-512.png"));
await sharp(svg).resize(32, 32).png().toFile(join(out, "favicon-32.png"));

// Maskable: the whole canvas must be painted (launchers mask with a circle or
// squircle), and the recognisable part sits inside the middle 80% safe zone.
const safe = Math.round(512 * 0.72);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: field },
})
  .composite([{ input: await sharp(svg).resize(safe, safe).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(join(out, "maskable-512.png"));

// Apple touch icon: full-bleed again — iOS applies its own rounded mask.
const apple = Math.round(180 * 0.78);
await sharp({
  create: { width: 180, height: 180, channels: 4, background: field },
})
  .composite([{ input: await sharp(svg).resize(apple, apple).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(join(out, "apple-touch-icon-180.png"));

console.log("icons written to apps/web/public/icons/");
