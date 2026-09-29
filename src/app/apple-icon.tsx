/**
 * Apple touch icon, generated from the mark.
 *
 * The same mark as `icon.tsx` at the size iOS pins to a home screen — kept as
 * its own file because the convention is per-size. It scales rather than
 * reflows: a home-screen icon and a tab favicon that read as two different
 * brands is the one thing worth avoiding here.
 *
 * 📖 Docs: obsidian/frontend/seo-metadata.md
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { StackedMark } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const font = await readFile(
    join(process.cwd(), "src/app/fonts/GeneralSans-Medium.otf"),
  );

  return new ImageResponse(<StackedMark size={size.width} />, {
    ...size,
    fonts: [{ name: "General Sans", data: font, weight: 500, style: "normal" }],
  });
}
