"use client";

import { useEffect, useRef } from "react";

import { Action } from "@/components/ui/action";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { Rule } from "@/components/ui/rule";
import { TypeIn } from "@/components/ui/type-in";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { brand } from "@/lib/brand";
import { Receipt } from "@/views/app/receipt";
import { SECTION_COUNT, sectionIndex, ticket } from "@/data/content";

/**
 * A thermal printer, feeding the ticket a trade prints.
 *
 * The scroll is the motor. The paper is not revealed, faded or slid in: it is
 * pushed out of the slot a step at a time, and scrolling back up pulls it in
 * again, because the scroll position *is* the animation's clock rather than
 * something that starts it. Stop halfway and the paper stops halfway.
 *
 * **The feed is quantised.** A real printer advances the roll in discrete
 * pulls, so the progress is rounded to `STEPS` before it is written. Smooth
 * travel here reads as a picture being slid up behind a hole; the jerk is the
 * whole illusion, and the eased tail (`EASE_POWER`) is what stops it feeling
 * mechanical rather than made.
 *
 * Three things ride the same clock so they cannot drift apart: the paper's
 * travel, the shadow it casts as it leaves the housing, and the panel's own
 * readout. The lamp blinks on the step, not on a timer.
 *
 * **The paper is the app's own receipt.** The slip that feeds out is the
 * same component a closed position prints in the app, filled from a sample
 * close, so the landing can never show a ticket the product does not print.
 *
 * **Nothing here goes through React.** The frame handler writes one custom
 * property and two strings onto nodes it kept refs to. Only `transform` moves,
 * so no frame costs a layout.
 *
 * 📖 Docs: obsidian/frontend/components/common.md
 */

/** Pulls the roll makes across the whole feed. */
const STEPS = 46;
/**
 * Progress spent still at each end of the pin.
 *
 * The block lands, holds for a beat, prints, and holds again with the ticket
 * out before the page moves on. Without the two dead zones the paper starts
 * moving the instant the block stops and stops the instant it leaves, which
 * reads as a jump rather than as a machine being watched.
 */
const SETTLE = 0.08;
const REST = 0.22;
/**
 * The unpinned fallback: where the feed begins and ends, as the machine's own
 * top edge measured down the screen.
 *
 * The pin only exists where the block is taller than the screen. A phone stacks
 * the two columns into something that is already a screenful, so there the feed
 * is keyed to the machine and runs as it scrolls past.
 */
const START = 0.92;
const END = 0.24;
/** Above 1 the last few pulls come slower, the way a roll runs out of push. */
const EASE_POWER = 1.6;
/** The shadow at full feed: how far it falls and how soft it is, px. */
const SHADOW = { y: 26, blur: 22 };

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export const Ticket = () => {
  const trackRef = useRef<HTMLElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const frame = windowRef.current;
    const paper = paperRef.current;
    if (!track || !frame || !paper) return;

    const paint = (fed: number): void => {
      paper.style.setProperty("--fed", fed.toFixed(4));

      const step = Math.round(fed * STEPS);
      const lamp = lampRef.current;
      // On while the roll is pulling, steady once the ticket is out: the lamp
      // is driven by the step it is on, so it can never blink out of time with
      // the paper it is reporting on.
      if (lamp) {
        lamp.style.opacity =
          fed >= 1 ? "1" : fed <= 0 ? "0.2" : step % 2 ? "1" : "0.28";
      }

      const status = statusRef.current;
      if (status) {
        status.textContent =
          fed >= 1
            ? ticket.status.done
            : fed <= 0
              ? ticket.status.idle
              : `${ticket.status.printing} ${Math.round(fed * 100)}%`;
      }
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      paint(1);
      return;
    }

    paint(0);
    let last = -1;

    return subscribeToTicker(
      () => {
        const height = window.innerHeight;
        const box = track.getBoundingClientRect();
        // How much scroll the block holds still for. Over a few pixels it is
        // pinned and the pin is the clock; at zero the block is an ordinary one
        // and the machine's own position is.
        const travel = box.height - height;

        const raw =
          travel > 8
            ? clamp((clamp(-box.top / travel) - SETTLE) / (1 - SETTLE - REST))
            : clamp(
                (START * height - frame.getBoundingClientRect().top) /
                  ((START - END) * height),
              );

        // Eased first, then quantised: quantising the eased value keeps every
        // pull the same size on the paper while the time between them stretches.
        const fed =
          Math.round((1 - Math.pow(1 - raw, EASE_POWER)) * STEPS) / STEPS;

        if (fed === last) return;
        last = fed;
        paint(fed);
      },
      () => 0,
    );
  }, []);

  return (
    <section
      ref={trackRef}
      id={ticket.head.id}
      className="border-t border-rule-ink bg-surface-ink text-ink-on-ink lg:h-[260vh]"
    >
      {/* The pinned screen. The block lands, stops, and the ticket is printed
          in front of the reader rather than on the way past. The pin only runs
          where there is room for it: below `lg` the two columns stack into a
          screenful of their own and the section is an ordinary block. */}
      <div className="flex min-h-screen items-center overflow-hidden lg:sticky lg:top-0 lg:h-screen lg:min-h-0">
        <div className="mx-auto w-full max-w-[90rem] px-5 py-20 sm:px-8 sm:py-24 lg:py-0">
          <Reveal y={12} className="flex items-center gap-4">
            <span className="label whitespace-nowrap">
              <span className="text-dim-ink">[N.</span>
              <span>
                {String(sectionIndex(ticket.head.id)).padStart(2, "0")}
              </span>
              <span className="text-dim-ink">
                /{String(SECTION_COUNT).padStart(2, "0")}]
              </span>
            </span>
            <Rule className="w-8 bg-rule-ink" delay={80} />
            <TypeIn
              text={`> ${ticket.head.label}`}
              className="label whitespace-nowrap text-dim-ink"
              delay={120}
            />
            <Rule className="flex-1 bg-rule-ink" delay={160} />
          </Reveal>

          {/* The machine stands in the middle of the block and the argument is
            split either side of it, the way the reference builds this: the
            printer is the subject, not an illustration beside one. The copy
            columns are the same width, so the paper comes out on the section's
            own centre line whatever the window is doing. */}
          <div className="mt-14 grid items-center gap-14 lg:mt-16 lg:grid-cols-[1fr_auto_1fr] lg:gap-12">
            <div className="flex flex-col gap-6">
              <Reveal y={20} delay={80}>
                <h2 className="max-w-[20ch] text-[2.25rem] font-medium leading-[1.05] tracking-tight sm:text-[3rem]">
                  <TypeIn block text={ticket.head.heading[0]} delay={220} />
                  <TypeIn
                    block
                    text={ticket.head.heading[1]}
                    delay={220 + ticket.head.heading[0].length * 17}
                    className="text-dim-ink"
                  />
                </h2>
              </Reveal>

              <Reveal y={20} delay={140}>
                <p className="max-w-[34ch] text-sm leading-relaxed">
                  {ticket.lede}
                </p>
              </Reveal>
            </div>

            {/* The machine. A fixed width: the receipt is set in mono at a
              fixed size, so its measure, not the screen, decides the paper. */}
            <Reveal
              y={28}
              delay={120}
              config={{ tension: 120, friction: 28 }}
              className="mx-auto flex w-[17rem] flex-col items-center sm:w-[18rem] lg:w-[19rem]"
            >
              <div className="relative w-full">
                {/* The housing. It hangs a little over the paper's own frame so
                  the sheet comes out of the middle of the bar and passes in
                  front of its lower lip, the way it does on a real one. */}
                <span
                  aria-hidden
                  className="absolute bottom-full left-1/2 z-0 h-9 w-[124%] -translate-x-1/2 translate-y-[1.1rem] rounded-[3px] bg-rule-ink"
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-dim-ink/50" />
                  {/* The lower lip, in the section's own dark: the bar is lit on
                    top and in shadow underneath, which is the whole of what
                    makes a flat rectangle read as a moulded housing. */}
                  <span className="absolute inset-x-0 bottom-0 h-[1.1rem] rounded-b-[3px] bg-surface-ink-2" />
                  <span className="absolute inset-x-[5%] bottom-[1.1rem] h-[5px] rounded-[1px] bg-surface-ink" />
                  <span
                    ref={lampRef}
                    style={{ opacity: 0.2 }}
                    className="absolute right-[7%] top-[0.6rem] size-[5px] bg-accent"
                  />
                </span>

                {/* The slot's mouth. Its top edge is the line the paper appears
                  at; everything above it is inside the machine. */}
                <div
                  ref={windowRef}
                  className="relative z-10 w-full overflow-hidden"
                >
                  {/* In flow, so the slot is exactly as tall as the receipt;
                    the translate is a percentage of the paper's own height. */}
                  <div
                    ref={paperRef}
                    className="relative will-change-transform"
                    style={{
                      // Written by the frame handler; both the travel and the
                      // shadow read it, so they cannot come apart.
                      ["--fed" as string]: 0,
                      transform:
                        "translate3d(0, calc(-100% + var(--fed) * 100%), 0)",
                      filter: `drop-shadow(0 calc(var(--fed) * ${SHADOW.y}px) calc(var(--fed) * ${SHADOW.blur}px) var(--shadow-paper))`,
                    }}
                  >
                    <Receipt event={ticket.sample} />
                  </div>
                </div>
              </div>

              <span className="mt-6 flex items-center gap-2">
                <span aria-hidden className="size-[5px] bg-accent" />
                <Label tone="ink">
                  <span ref={statusRef}>{ticket.status.idle}</span>
                </Label>
              </span>

              <p className="mt-3 max-w-[26ch] text-center text-xs leading-relaxed text-dim-ink">
                {ticket.caption}
              </p>
            </Reveal>

            {/* The other half of the argument, on the machine's right. It lands
              last, once the paper is already on its way out. */}
            <div className="flex flex-col items-start gap-8">
              <Reveal y={20} delay={180}>
                <p className="max-w-[34ch] text-sm leading-relaxed text-dim-ink">
                  {ticket.body}
                </p>
              </Reveal>

              <Reveal y={20} delay={240}>
                <Action tone="ink" href={brand.links.app}>
                  {ticket.head.action}
                </Action>
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
