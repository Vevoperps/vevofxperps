/**
 * Apple touch icon, generated from the logo.
 *
 * The same mark as `icon.tsx` at the size iOS pins to a home screen — kept as
 * its own file because the convention is per-size. Also the `logo` in the
 * site's JSON-LD, so search engines show the same square.
 *
 * 📖 Docs: obsidian/frontend/seo-metadata.md
 */

import { ImageResponse } from "next/og";

import { LogoMark } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LogoMark size={size.width} />, size);
}
