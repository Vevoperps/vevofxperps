"use client";

/**
 * The demo player: a framed 16:9 panel that shows the video's YouTube
 * thumbnail with a play button, and mounts the player only when clicked.
 *
 * **A facade, not an embed.** Dropping an `<iframe>` on the page costs a
 * megabyte of YouTube's player and a set of third-party cookies for every
 * visitor, most of whom never press play. So until the click the frame shows
 * only the thumbnail image and a YouTube-style play button; the iframe mounts
 * on press — with `autoplay=1`, so the press that paid for it is the press that
 * starts it.
 *
 * With no id configured the same frame renders as a labelled placeholder. That
 * is deliberate: an empty embed is a broken-looking black box, while this reads
 * as a slot waiting for its recording.
 *
 * 📖 Docs: obsidian/frontend/components/common.md
 */

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { install } from "@/data/content";

const { video } = install;

export const VideoFrame = () => {
  const [playing, setPlaying] = useState(false);
  const id = video.youtubeId;

  // maxres isn't generated for every upload; fall back to hqdefault on error.
  const [thumb, setThumb] = useState(
    id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null,
  );

  return (
    <figure className="w-full border border-rule-ink bg-surface-ink shadow-[0_2rem_4rem_-2rem_rgba(0,0,0,0.55)]">
      {/* Title bar — the same chrome the code card had, so the section keeps
          its place in the page's language. */}
      <header className="flex items-center justify-between border-b border-rule-ink px-4 py-3 text-ink-on-ink">
        <Label tone="ink" strong>
          {video.file}
        </Label>
        <Label tone="ink">{video.duration}</Label>
      </header>

      <div className="relative aspect-video w-full overflow-hidden bg-surface-ink-2">
        {playing && id ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : id ? (
          /* The standard YouTube facade: the video's own thumbnail with a
             centred play button. One click swaps it for the live player. */
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`${video.play} - ${video.title}`}
            className="group absolute inset-0 block cursor-pointer"
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt={video.title}
                loading="lazy"
                onError={() =>
                  setThumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)
                }
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}

            {/* A faint scrim so the button reads on any frame; it lifts on
                hover so the thumbnail comes forward. */}
            <span
              aria-hidden
              className="absolute inset-0 bg-black/15 transition-colors duration-[var(--duration-fast)] ease-entrance group-hover:bg-black/5"
            />

            {/* The YouTube play button, drawn to spec and reddening on hover. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.45)] transition-transform duration-[var(--duration-fast)] ease-entrance group-hover:scale-105"
            >
              <svg
                width="90"
                height="63"
                viewBox="0 0 68 48"
                aria-hidden
                className="block"
              >
                <path
                  className="fill-[#212121]/85 transition-colors group-hover:fill-[#ff0000]"
                  d="M66.52 7.74c-0.78-2.93-2.49-5.42-5.42-6.2C55.79.13 34 0 34 0S12.21.13 6.9 1.54c-2.93.78-4.63 3.27-5.42 6.2C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.42 5.42 6.2C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.54c2.93-.78 4.64-3.27 5.42-6.2C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                />
                <path d="M 45,24 27,14 27,34" fill="#fff" />
              </svg>
            </span>
          </button>
        ) : (
          <>
            {/* No recording yet, so this is the shape of one: the play target
                a viewer expects, drawn and inert, with the caption saying why
                it does nothing. */}
            <span
              aria-hidden
              className="dotfield absolute inset-0 text-dim-ink"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-5">
              <span
                aria-hidden
                className="flex h-12 w-[4.5rem] items-center justify-center rounded-[0.75rem] bg-ink-on-ink/15"
              >
                <span className="ml-1 border-y-[0.5rem] border-l-[0.85rem] border-y-transparent border-l-ink-on-ink/60" />
              </span>
              <Label tone="ink">{video.placeholder}</Label>
            </span>
          </>
        )}

        {/* Corner marks, as on the closing card — they are what makes a plain
            rectangle read as a frame. */}
        {["left-3 top-3", "right-3 top-3", "left-3 bottom-3", "right-3 bottom-3"].map(
          (position) => (
            <span
              key={position}
              aria-hidden
              className={`pointer-events-none absolute size-2 bg-ink-on-ink/70 ${position}`}
            />
          ),
        )}
      </div>
    </figure>
  );
};
