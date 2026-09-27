/**
 * Draws the installed-app icons (public/icons) from the brand mark: a
 * Fraunces "R" on the night blue. Run again after changing the mark.
 * Usage: npx tsx scripts/generate-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { ImageResponse } from "next/og";

const NIGHT = "#0f2240";
const LIMESTONE = "#f5f1ea";
const font = fs.readFileSync(path.join(process.cwd(), "lib/print/fonts/Fraunces-600.ttf"));
const out = path.join(process.cwd(), "public/icons");

/**
 * `scale` is the letter's height against the icon's: a maskable icon keeps it
 * inside the circle Android may cut the icon to.
 */
async function draw(file: string, size: number, scale: number) {
  const image = new ImageResponse(
    h(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: NIGHT,
          color: LIMESTONE,
          fontFamily: "Fraunces",
          fontSize: size * scale,
          // Optical centring: the cap sits a little high in its line box.
          paddingTop: size * scale * 0.06,
        },
      },
      "R",
    ),
    { width: size, height: size, fonts: [{ name: "Fraunces", data: font, weight: 600 }] },
  );
  fs.writeFileSync(path.join(out, file), Buffer.from(await image.arrayBuffer()));
  console.log(`public/icons/${file}`);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await draw("icon-192.png", 192, 0.62);
  await draw("icon-512.png", 512, 0.62);
  await draw("icon-maskable-512.png", 512, 0.46);
  await draw("apple-touch-icon.png", 180, 0.62);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
