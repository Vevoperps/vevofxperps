"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The film behind the app's opening screen.
 *
 * It is decoration, so it is never allowed to cost the page anything a reader
 * would notice:
 *
 * - **The poster paints first.** A still of the first frame is in the server
 *   HTML (through `next/image`, so it arrives as AVIF/WebP at the screen's
 *   size), and the block is never empty while the film loads. A reader who
 *   never gets the film still gets the picture.
 * - **The file is picked for the screen.** No sources are rendered on the
 *   server; in the browser a phone, or a connection asking to save data, gets
 *   the 720p cut, a retina or 1440p screen the 1440p one, everything else
 *   1080p.
 * - **It only plays while it is seen.** Scrolled away or in a background tab
 *   it pauses, so the decoder is not burning a core under the rates table.
 * - **Reduced motion gets the still.** The film is never fetched at all.
 *
 * The darkening is a flat layer over the film rather than a CSS filter on it:
 * a filter on a playing video is re-run every frame, a translucent layer is
 * composited for free.
 */

const POSTER = "/video/hero-v3-poster.webp";

/**
 * Three cuts of the same 57-second loop, 30 fps, no audio. Each source names
 * its codec and level, so a browser that cannot decode one skips to the next
 * without fetching it: AV1 (Chrome, Edge, Firefox, newer Safari), then HEVC
 * (Safari on any recent Apple device), then H.264 (everything else).
 */
interface Source {
  src: string;
  type: string;
}

const CUTS = {
  sd: [
    { src: "/video/hero-v3-720.webm", type: 'video/webm; codecs="av01.0.05M.08"' },
    { src: "/video/hero-v3-720-hevc.mp4", type: 'video/mp4; codecs="hvc1"' },
    { src: "/video/hero-v3-720.mp4", type: "video/mp4" },
  ],
  hd: [
    { src: "/video/hero-v3-1080.webm", type: 'video/webm; codecs="av01.0.08M.08"' },
    { src: "/video/hero-v3-1080-hevc.mp4", type: 'video/mp4; codecs="hvc1"' },
    { src: "/video/hero-v3-1080.mp4", type: "video/mp4" },
  ],
  qhd: [
    { src: "/video/hero-v3-1440.webm", type: 'video/webm; codecs="av01.0.12M.08"' },
    { src: "/video/hero-v3-1080-hevc.mp4", type: 'video/mp4; codecs="hvc1"' },
    { src: "/video/hero-v3-1080.mp4", type: "video/mp4" },
  ],
} satisfies Record<string, Source[]>;

type Cut = keyof typeof CUTS;

interface NetworkInformation {
  saveData?: boolean;
}

/**
 * Sized by the pixels the film will actually cover: a retina laptop or a
 * 1440p monitor gets the sharper cut, a phone the light one.
 */
const pickCut = (): Cut | null => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return "sd";
  if (!window.matchMedia("(min-width: 768px)").matches) return "sd";
  const pixels = window.innerWidth * (window.devicePixelRatio || 1);
  return pixels > 2200 ? "qhd" : "hd";
};

/** The choice is made once per page load; nothing needs to re-trigger it. */
const subscribe = () => () => {};
/** On the server, and during hydration, there is no film: only the still. */
const serverCut = (): Cut | null => null;

export const HeroVideo = ({ dim = 0.15 }: { dim?: number }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cut = useSyncExternalStore(subscribe, pickCut, serverCut);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cut) return;

    // React does not reliably write the `muted` attribute, and an unmuted
    // video is refused autoplay; set it on the element itself.
    video.muted = true;
    video.defaultMuted = true;

    let seen = true;
    const sync = (): void => {
      if (seen && document.visibilityState === "visible") {
        video.play().catch(() => {
          // Autoplay refused (low-power mode, say): the poster stays up.
        });
      } else {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        seen = entry?.isIntersecting ?? false;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, [cut]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-surface-ink"
    >
      <Image
        src={POSTER}
        alt=""
        fill
        priority
        sizes="100vw"
        quality={80}
        className="object-cover"
      />

      {cut ? (
        <video
          ref={videoRef}
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          className="absolute inset-0 h-full w-full object-cover"
        >
          {CUTS[cut].map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
        </video>
      ) : null}

      {/* The darkening, so the copy on top stays readable on the bright shots:
          a flat veil, plus a soft fall-off at the top (under the bar) and at
          the bottom, where the film fades into the page instead of ending on
          a hard edge above the rates table. */}
      <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
      <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-black/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-surface-ink via-surface-ink/40 to-transparent" />
    </div>
  );
};
