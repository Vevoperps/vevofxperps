"use client";

import { useEffect, useRef } from "react";

import Link from "next/link";

import { Action } from "@/components/ui/action";
import { Label } from "@/components/ui/label";
import { SocialMark } from "@/components/ui/social-mark";
import { Reveal } from "@/components/ui/reveal";
import { GridField } from "@/views/home/grid-field";
import { TypedWord } from "@/views/home/typed-word";
import { WordmarkBlocks } from "@/views/home/wordmark-blocks";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { brand } from "@/lib/brand";
import { cta, footer } from "@/data/content";

/**
 * How the page ends: two running bands, the call to action on the same dark
 * grid the page opened on, and the footer.
 *
 * The grid panel is the bookend — the hero's field, the same canvas, lighting
 * under the cursor the same way — so the last screen answers the first. The
 * white card sitting on it borrows the reference's corner marks: four small
 * squares that make the card read as something placed on the grid rather than
 * a hole cut out of it.
 *
 * Both bands run off the shared ticker, for the reason the rates strip does:
 * one rAF for the whole app, one transform written per frame, and a CSS
 * keyframe would be banned here anyway.
 */

/** Band speed, px per second. Slower than the rates strip: this one is decor. */
const SPEED = 26;

/** One band. Two of them frame the panel, running the same phrase. */
const Band = ({ tone }: { tone: "top" | "bottom" }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let offset = 0;
    let last = performance.now();

    return subscribeToTicker(
      (time) => {
        const track = trackRef.current;
        if (!track) return;
        const delta = Math.min((time - last) / 1000, 0.05);
        last = time;
        const span = track.scrollWidth / 2;
        if (span > 0) {
          offset = (offset + SPEED * delta) % span;
          track.style.transform = `translate3d(${-offset}px,0,0)`;
        }
      },
      () => 0,
    );
  }, []);

  const phrase = [...cta.marquee, "//"];
  const run = Array.from({ length: 14 }, () => phrase).flat();

  return (
    <div
      className={`overflow-hidden bg-surface-paper py-3 ${
        tone === "top" ? "border-y" : "border-b"
      } border-rule-paper`}
    >
      <div ref={trackRef} className="flex w-max gap-6 will-change-transform">
        {[...run, ...run].map((word, index) => (
          <span
            key={index}
            aria-hidden
            className="label whitespace-nowrap text-accent"
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
};

/** The four marks that pin the card to the grid. */
const CornerMarks = () => (
  <>
    {[
      "left-3 top-3",
      "right-3 top-3",
      "left-3 bottom-3",
      "right-3 bottom-3",
    ].map((position) => (
      <span
        key={position}
        aria-hidden
        className={`absolute size-3 bg-surface-ink ${position}`}
      />
    ))}
  </>
);

export const Closing = () => (
  <footer className="border-t border-rule-paper bg-surface-paper text-foreground">
    <Band tone="top" />

    {/* The call to action, on the hero's grid. */}
    <div className="relative overflow-hidden bg-surface-ink">
      <GridField />

      <div className="pointer-events-none relative mx-auto flex w-full max-w-[90rem] justify-center px-5 py-16 sm:px-8 sm:py-24">
        <Reveal y={24} className="w-full max-w-[56rem]">
          <div className="relative flex flex-col items-center gap-8 bg-surface-paper px-6 py-16 text-center sm:px-16 sm:py-20">
            <CornerMarks />

            <Label>{cta.eyebrow}</Label>

            <h2 className="text-[2.25rem] font-medium leading-[1.06] tracking-tight sm:text-[3.5rem]">
              {cta.heading.lead}
              <br />
              <TypedWord
                words={cta.typed}
                className="font-display text-[1.2em] leading-[0.85] text-accent"
              />
              <br />
              {cta.heading.tail}
            </h2>

            {/* The panel above is inert so the grid stays hoverable; the one
                thing on it that must be clickable takes its events back. */}
            <span className="pointer-events-auto">
              <Action href={brand.links.app}>{cta.action}</Action>
            </span>
          </div>
        </Reveal>
      </div>
    </div>

    <Band tone="bottom" />

    {/* The footer proper: one row of links, the name, one legal line. */}
    <div className="mx-auto w-full max-w-[90rem] px-5 py-16 sm:px-8 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_repeat(3,minmax(0,0.8fr))] lg:gap-10">
        <div className="flex flex-col gap-5">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            <span className="text-sm font-medium text-accent">
              {footer.status}
            </span>
          </span>

          <p className="max-w-[30ch] text-sm leading-relaxed text-dim-paper">
            {footer.tagline}
          </p>

          <ul className="mt-1 flex items-center gap-4">
            {footer.follow.map((item) => (
              <li key={item.kind}>
                {brand.links[item.key] ? (
                  <a
                    href={brand.links[item.key] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${brand.name} on ${item.name}`}
                    className="block text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
                  >
                    <SocialMark kind={item.kind} />
                  </a>
                ) : (
                  <span
                    aria-label={`${item.name}, soon`}
                    title="soon"
                    className="block text-faint"
                  >
                    <SocialMark kind={item.kind} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {footer.columns.map((column) => (
          <nav key={column.label} className="flex flex-col gap-4">
            <span className="text-sm font-medium tracking-tight">
              {column.label}
            </span>
            <ul className="flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  {link.href ? (
                    <Link
                      href={link.href}
                      className="text-sm text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <span className="text-sm text-faint">{link.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* The name, last, and the only large thing down here. */}
      <div className="mt-20">
        <WordmarkBlocks />
      </div>

      {/* The legal links live in the Venue column above, where they are real
          links. Repeating them down here as plain labels was two dead words
          under a rule. */}
      <div className="mt-10 border-t border-rule-paper pt-6">
        <Label>
          {footer.legal.rights} · {brand.chain.name}
        </Label>
      </div>
    </div>
  </footer>
);
