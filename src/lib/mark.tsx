/**
 * The icon mark, drawn rather than shipped as a PNG.
 *
 * Both the favicon and the iOS touch icon are the same mark at two sizes, so
 * the geometry lives here once and each file asks for it at its own size. A
 * shipped PNG would mean two files to keep in step with the brand layer and a
 * rebrand that silently misses them.
 *
 * **The numbers are measured, not tokens.** `next/og` rasterises in Node with
 * no stylesheet, so nothing in `globals.css` can reach it — the colours come
 * from `brandMark` and the metrics are written out. They are calibrated against
 * a 64px tile and scaled from there, which is why they carry decimals: the
 * lines are positioned so the ink lands where it should, not so the numbers
 * look tidy.
 *
 * **Both lines bleed past the tile on purpose.** The wordmark is wider than the
 * square and the product word is wider still, so the `v` is cut on the left and
 * the `S` on the right. At 16px in a tab strip a mark is an outline, not
 * reading matter, and a mark that fills its tile is a stronger outline than one
 * floating inside it.
 *
 * 📖 Docs: obsidian/frontend/seo-metadata.md
 */

import { brandMark } from "@/lib/site";

/** Every metric below is calibrated against this tile, then scaled. */
const BASE = 64;

export const StackedMark = ({ size }: { size: number }) => {
  const k = size / BASE;

  const lines = [
    // The wordmark. Pulled left by half its overhang so the two cut edges
    // match; leading is set by the line below, not by this one.
    { text: brandMark.stack[0], fontSize: 31.3, left: -1.25, top: 6 },
    // The product word, pulled up hard: the two lines almost touch, which is
    // what makes the pair read as one block rather than two words.
    { text: brandMark.stack[1], fontSize: 22.7, left: -0.9, top: -6.6 },
  ];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        background: brandMark.background,
        color: brandMark.foreground,
        fontFamily: "General Sans",
        overflow: "hidden",
      }}
    >
      {lines.map((line) => (
        <div key={line.text} style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              fontSize: line.fontSize * k,
              lineHeight: 1,
              marginLeft: line.left * k,
              marginTop: line.top * k,
              whiteSpace: "nowrap",
            }}
          >
            {line.text}
          </div>
        </div>
      ))}
    </div>
  );
};
