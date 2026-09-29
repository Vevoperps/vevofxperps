/**
 * Favicon, generated from the logo at build time.
 *
 * A Next file convention: the `<link rel="icon">` is injected automatically, so
 * nothing in `generateMetadata` needs to name it. The logo is a vector in
 * `@/lib/logo`, rasterised here at the size the tab strip asks for, so the
 * favicon is always the real mark and never a stale PNG.
 *
 * 📖 Docs: obsidian/frontend/seo-metadata.md
 */

import { ImageResponse } from "next/og";

import { LogoMark } from "@/lib/logo";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<LogoMark size={size.width} />, size);
}
