import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * The picture shown when a link to Résido is shared (WhatsApp, Facebook,
 * LinkedIn, X…): the brand mark and the headline on the night blue, the
 * arches of the landing page behind.
 */
export const alt = "Résido — la gestion de copropriété, sans tableur";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NIGHT = "#0f2240";
const LIMESTONE = "#f5f1ea";
const SOFT = "#bfcbdd";
const OCHRE = "#c88a3e";

export default async function OpenGraphImage() {
  const fonts = path.join(process.cwd(), "lib/print/fonts");
  const [fraunces, manrope] = await Promise.all([
    readFile(path.join(fonts, "Fraunces-600.ttf")),
    readFile(path.join(fonts, "Manrope-700.ttf")),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: NIGHT,
          color: LIMESTONE,
          fontFamily: "Manrope",
          position: "relative",
        }}
      >
        <svg
          width="560"
          height="460"
          viewBox="0 0 560 460"
          fill="none"
          style={{ position: "absolute", right: -40, bottom: -30, opacity: 0.16 }}
        >
          <path d="M40 460V230C40 128 122 46 224 46C326 46 408 128 408 230V460" stroke={LIMESTONE} strokeWidth="3" />
          <path d="M96 460V238C96 168 153 110 224 110C295 110 352 168 352 238V460" stroke={LIMESTONE} strokeWidth="3" />
          <path d="M152 460V246C152 206 184 174 224 174C264 174 296 206 296 246V460" stroke={LIMESTONE} strokeWidth="3" />
          <path d="M430 460V330C430 288 462 256 496 256C530 256 560 288 560 330V460" stroke={OCHRE} strokeWidth="3" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: LIMESTONE,
              color: NIGHT,
              fontFamily: "Fraunces",
              fontSize: 40,
            }}
          >
            R
          </div>
          <div style={{ fontFamily: "Fraunces", fontSize: 44 }}>Résido</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 820 }}>
          <div style={{ fontSize: 24, letterSpacing: 4, color: OCHRE, textTransform: "uppercase" }}>
            Logiciel de syndic
          </div>
          <div style={{ fontFamily: "Fraunces", fontSize: 72, lineHeight: 1.05 }}>
            La gestion de copropriété, sans tableur.
          </div>
          <div style={{ fontSize: 28, color: SOFT }}>Charges, encaissements, dépenses et trésorerie, cycle par cycle.</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: fraunces, weight: 600 },
        { name: "Manrope", data: manrope, weight: 700 },
      ],
    },
  );
}
