/**
 * Draws the installed-app icons (public/icons) and the browser tab's icon
 * (app/favicon.ico) from the brand mark: a Fraunces "R" on the night blue.
 * Run again after changing the mark.
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
 * inside the circle Android may cut the icon to. `rounded`: corners cut round
 * on a transparent ground, like the brand mark in the app (the tab icon);
 * home-screen icons stay square, the system rounds them itself.
 */
async function render(size: number, scale: number, rounded = false): Promise<Buffer> {
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
          borderRadius: rounded ? size * 0.22 : 0,
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
  return Buffer.from(await image.arrayBuffer());
}

async function draw(file: string, size: number, scale: number) {
  fs.writeFileSync(path.join(out, file), await render(size, scale));
  console.log(`public/icons/${file}`);
}

/** An .ico holding PNG images (every browser since IE Vista reads them): header, directory, images. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  await draw("icon-192.png", 192, 0.62);
  await draw("icon-512.png", 512, 0.62);
  await draw("icon-maskable-512.png", 512, 0.46);
  await draw("apple-touch-icon.png", 180, 0.62);
  // The browser tab's icon: small, so the letter is bigger.
  const tab = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await render(size, 0.74, true) })));
  fs.writeFileSync(path.join(process.cwd(), "app/favicon.ico"), ico(tab));
  console.log("app/favicon.ico");
  fs.writeFileSync(path.join(out, "favicon-96.png"), await render(96, 0.7, true));
  console.log("public/icons/favicon-96.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
