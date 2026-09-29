/**
 * The vevo logo: a white inverted triangle on the brand's logo blue, with a
 * blue `v` cut into it.
 *
 * **Drawn, not shipped as a PNG.** The same geometry serves the favicon (16px
 * in a tab strip), the iOS home-screen icon (180px), the hero and the header
 * bar. One vector means one source of truth and a mark that is sharp at every
 * one of those sizes; a raster would be soft at the small end and a second
 * file to keep in step at the large one.
 *
 * **Plain SVG attributes only.** `next/og` (the favicon and touch icon) renders
 * through Satori, which understands `<svg>`, `<rect>` and `<polygon>` with
 * literal fills but not CSS classes or custom properties. So the colours are
 * written out here, and this file must stay free of Tailwind.
 *
 * Geometry was measured off the approved 1254px artwork and normalised to a
 * 100-unit square. The `v` is centred on the triangle's axis; the artwork had
 * it about four units left of centre, which reads as a mistake at icon size.
 */

/** The logo's own blue, sampled from the artwork (#011AFE). */
export const LOGO_BLUE = "#001AFF";
export const LOGO_WHITE = "#FFFFFF";

const TRIANGLE = "12.3,20.3 87.7,20.3 50,83.2";

const V =
  "40.55,38.68 45.33,38.68 50,50.72 54.67,38.68 59.45,38.68 52.39,55.58 47.61,55.58";

export interface LogoMarkProps {
  /** Pixel size for `next/og`; omit on the site and size it with CSS. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when the logo sits beside the written name. */
  title?: string;
}

export const LogoMark = ({ size, className, title }: LogoMarkProps) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    className={className}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    xmlns="http://www.w3.org/2000/svg"
  >
    {title ? <title>{title}</title> : null}
    <rect width="100" height="100" fill={LOGO_BLUE} />
    <polygon points={TRIANGLE} fill={LOGO_WHITE} />
    <polygon points={V} fill={LOGO_BLUE} />
  </svg>
);
