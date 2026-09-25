import path from "node:path";
import { Font, StyleSheet } from "@react-pdf/renderer";

/**
 * The printed documents' palette and type. A PDF has no CSS variables, so
 * these mirror the light tokens of app/globals.css — paper is always light,
 * whatever the viewer's theme. Change a colour there, change it here.
 */
export const C = {
  ink: "#16181d",
  ink2: "#3a3f48",
  muted: "#5e6470",
  line: "#e4ddd1",
  lineSoft: "#f1ece3",
  ground: "#f5f1ea",
  surface2: "#fbf9f5",
  white: "#ffffff",
  night: "#0f2240",
  nightInk: "#c9d3e3",
  nightMuted: "#8fa3c0",
  nightLine: "#233a5e",
  nightRaised: "#16294a",
  nightPos: "#8fd3ae",
  onNight: "#f5f1ea",
  primary: "#1b4f8a",
  primarySoft: "#e3ecf7",
  primaryTint: "#f2f6fb",
  olive: "#2f6b4f",
  oliveSoft: "#e2efe7",
  partial: "#d08a3c",
  ochre: "#b8651b",
  ochreLight: "#c88a3e",
  stone: "#b7ae9f",
  pos: "#1f5a3d",
  neg: "#9a4a0e",
  paidBg: "#e2efe7",
  paidFg: "#1f5a3d",
  partialBg: "#f7e8d6",
  partialFg: "#8a4611",
  unpaidBg: "#f5e1dd",
  unpaidFg: "#962b1f",
} as const;

// Static instances of the app's fonts (react-pdf reads TTF, not variable woff2).
const fonts = path.join(process.cwd(), "lib/print/fonts");
Font.register({
  family: "Manrope",
  fonts: [400, 500, 600, 700, 800].map((w) => ({ src: path.join(fonts, `Manrope-${w}.ttf`), fontWeight: w })),
});
Font.register({
  family: "Fraunces",
  fonts: [600, 700].map((w) => ({ src: path.join(fonts, `Fraunces-${w}.ttf`), fontWeight: w })),
});
// Words are never hyphenated: codes and names must stay whole.
Font.registerHyphenationCallback((word) => [word]);

export const S = StyleSheet.create({
  page: {
    fontFamily: "Manrope",
    fontSize: 8.5,
    color: C.ink,
    backgroundColor: C.white,
    paddingTop: 30,
    paddingBottom: 44,
    paddingHorizontal: 32,
  },
  display: { fontFamily: "Fraunces", fontWeight: 700 },
  muted: { color: C.muted },
  num: { textAlign: "right" },
  bold: { fontWeight: 700 },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    fontSize: 7,
    color: C.muted,
  },
  card: {
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 8,
    padding: 12,
    backgroundColor: C.white,
  },
  cardTitle: { fontFamily: "Fraunces", fontWeight: 700, fontSize: 11, marginBottom: 2 },
  cardHint: { fontSize: 7, color: C.muted, marginBottom: 8 },
});
