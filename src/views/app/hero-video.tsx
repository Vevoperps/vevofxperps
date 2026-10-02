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
 *   the 720p cut and everything else the 1080p one. AV1 first where the
 *   browser can decode it, H.264 everywhere else.
 * - **It only plays while it is seen.** Scrolled away or in a background tab
 *   it pauses, so the decoder is not burning a core under the rates table.
 * - **Reduced motion gets the still.** The film is never fetched at all.
 *
 * The darkening is a flat layer over the film rather than a CSS filter on it:
 * a filter on a playing video is re-run every frame, a translucent layer is
 * composited for free.
 */

const POSTER = "/video/hero-v1-poster.webp";

/**
 * Two cuts of the same 57-second loop, 24 fps, no audio. The AV1 type names
 * each file's real level, so a browser that cannot decode it skips straight
 * to the H.264 file instead of fetching one it will fail on.
 */
const CUTS = {
  sd: {
    av1: "/video/hero-v1-720.webm",
    av1Type: 'video/webm; codecs="av01.0.05M.08"',
    h264: "/video/hero-v1-720.mp4",
  },
  hd: {
    av1: "/video/hero-v1-1080.webm",
    av1Type: 'video/webm; codecs="av01.0.08M.08"',
    h264: "/video/hero-v1-1080.mp4",
  },
} as const;

type Cut = keyof typeof CUTS;

interface NetworkInformation {
  saveData?: boolean;
}

const pickCut = (): Cut | null => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return "sd";
  return window.matchMedia("(min-width: 768px)").matches ? "hd" : "sd";
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
          <source src={CUTS[cut].av1} type={CUTS[cut].av1Type} />
          <source src={CUTS[cut].h264} type="video/mp4" />
        </video>
      ) : null}

      {/* The darkening, so the copy on top stays readable on the bright shots. */}
      <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
    </div>
  );
};
