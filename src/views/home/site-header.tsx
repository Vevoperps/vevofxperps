"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { HoverType } from "@/components/ui/hover-type";
import { SocialMark } from "@/components/ui/social-mark";
import { brand } from "@/lib/brand";
import { nav } from "@/data/content";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { scrollTo } from "@/utils/scroll-to";

/**
 * The fixed bar.
 *
 * The reference boxes every item and butts them together, so the nav reads as a
 * row of cells rather than a row of words: one shared hairline between
 * neighbours, chevrons wrapped around whichever is current. The active item is
 * driven by the scroll rather than by the URL, because a hash route still
 * points at the last thing clicked while the reader is three sections further
 * down.
 *
 * **Why the links are intercepted.** The page scrolls under Lenis, which
 * rewrites the document's position every frame from its own state. A plain
 * `href="#fees"` sets that position behind its back and has it overwritten
 * before the next paint, so the bar looked live and moved nothing. The `href`
 * stays for middle-clicks, keyboard use and anyone reading the markup; the
 * click goes through Lenis.
 */
export const SiteHeader = () => {
  const [active, setActive] = useState<string>(nav[0].id);

  /**
   * A clicked item holds the highlight until the page arrives.
   *
   * Without this the marker walked through every section the glide passed on
   * its way — click FAQ from the top and the bar flickered How, Markets,
   * Countries, Fees before settling — which read as the button not having
   * taken the click. `until` is a safety net for a glide the reader interrupts
   * with the wheel, when Lenis never reports completion.
   */
  const pinned = useRef<{ id: string; until: number } | null>(null);

  /** What the ticker last set, kept in step with clicks — see `jump`. */
  const current = useRef("");

  useEffect(() => {
    return subscribeToTicker(
      () => {
        const pin = pinned.current;
        if (pin && performance.now() < pin.until) return;
        pinned.current = null;

        // The section whose top has most recently crossed a third of the
        // viewport: the same "what am I actually looking at" line the eye uses.
        //
        // "Most recently" is measured, not assumed from the array order: of
        // the sections above the line, the one whose top is lowest wins. With
        // the bar and the page in different orders, the old "last in the list"
        // rule lit Countries while the reader was on Fees.
        const line = window.innerHeight / 3;
        let found: string = nav[0].id;
        let best = -Infinity;
        for (const item of nav) {
          const node = document.getElementById(item.id);
          if (!node) continue;
          const top = node.getBoundingClientRect().top;
          if (top <= line && top > best) {
            best = top;
            found = item.id;
          }
        }
        if (found !== current.current) {
          current.current = found;
          setActive(found);
        }
      },
      () => 100,
    );
  }, []);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // A modified click is the reader asking for a new tab or a bookmark. Leave
    // it to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();

    pinned.current = { id, until: performance.now() + 2500 };
    current.current = id;
    setActive(id);

    scrollTo(id, {
      onComplete: () => {
        // Release only our own pin: a newer click has already replaced it.
        if (pinned.current?.id === id) pinned.current = null;
      },
    });
    // **No hash is written.** It used to be, so the address bar would name the
    // section, and it cost the back button: the hash outlived the click, and
    // every later return to this page honoured it instead of the position the
    // reader actually left from.
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between p-3 sm:p-4">
      <nav
        aria-label="Main navigation"
        className="pointer-events-auto flex bg-surface-paper"
      >
        {nav.map((item) => {
          const on = item.id === active;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => jump(event, item.id)}
              aria-current={on ? "true" : undefined}
              className={`label border-y border-r first:border-l ${
                on
                  ? "border-accent bg-accent text-ink-on-ink"
                  : "border-rule-paper text-accent hover:bg-surface-paper-2"
              } px-3.5 py-3.5 transition-colors duration-[var(--duration-fast)] ease-entrance`}
            >
              {/*
                Always rendered, hidden when inactive. Mounting the chevrons
                only on the active item made it 17px wider than its neighbours,
                so the whole row slid sideways every time the scroll changed
                which section was current. Aim at a 43px-wide item, the page
                starts moving, and the button walks out from under the cursor.
              */}
              <span aria-hidden className={`mr-1 ${on ? "opacity-60" : "invisible"}`}>
                &lt;
              </span>
              <HoverType text={item.label} />
              <span aria-hidden className={`ml-1 ${on ? "opacity-60" : "invisible"}`}>
                &gt;
              </span>
            </a>
          );
        })}
      </nav>

      <div className="pointer-events-auto flex items-stretch">
        {/*
          The feed, immediately left of the app. Rendered whether or not the
          account exists yet, because the bar's shape should not change on the
          day the handle is filled in; without one it says so rather than
          looking clickable and going nowhere.
        */}
        {brand.links.x ? (
          <a
            href={brand.links.x}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${brand.name} on X`}
            className="flex items-center border-y border-l border-rule-paper bg-surface-paper px-3 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink"
          >
            <SocialMark kind="x" />
          </a>
        ) : (
          <span
            title="X account coming soon"
            aria-label="X account coming soon"
            className="flex cursor-not-allowed items-center border-y border-l border-rule-paper bg-surface-paper px-3 text-dim-paper"
          >
            <SocialMark kind="x" />
          </span>
        )}

        <a
          href={brand.links.app ?? "#markets"}
          className="label flex items-center gap-3 border border-rule-paper bg-surface-paper px-3 py-2.5 text-accent transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink"
        >
          <span aria-hidden>↗</span>
          <HoverType text={brand.links.app ? "Launch app" : "Coming soon"} />
        </a>
      </div>
    </header>
  );
};
