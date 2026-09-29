/**
 * Favicon, generated from the mark at build time.
 *
 * A Next file convention: the `<link rel="icon">` is injected automatically, so
 * nothing in `generateMetadata` needs to name it. Drawn rather than shipped as a
 * PNG so it is always the real brand mark and the real brand blue — the starter's
 * placeholder icons were neither.
 *
 * The mark itself — two full-bleed lines, and why — lives in `@/lib/mark`, which
 * `apple-icon.tsx` renders at its own size.
 *
 * 📖 Docs: obsidian/frontend/seo-metadata.md
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { StackedMark } from "@/lib/mark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const font = await readFile(
    join(process.cwd(), "src/app/fonts/GeneralSans-Medium.otf"),
  );

  return new ImageResponse(<StackedMark size={size.width} />, {
    ...size,
    fonts: [{ name: "General Sans", data: font, weight: 500, style: "normal" }],
  });
}
