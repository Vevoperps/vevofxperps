"use client";

/**
 * The contents rail, with the chapter you are reading marked in the accent.
 *
 * It follows the scroll rather than the URL hash: a hash only changes when a
 * link is clicked, so a reader who scrolls would watch the rail stay pointed at
 * wherever they last clicked, which is worse than no marker at all.
 *
 * The rule for "reading" is the chapter whose top is the last one above a line
 * a third of the way down the screen — the same rule a person uses. It is
 * computed off the shared ticker with a cheap guard, because the answer changes
 * about once per chapter and not once per frame.
 *
 * **Three things this used to get wrong.**
 *
 * - **Clicks went nowhere.** The entries were plain `href="#id"` links, and
 *   the page scrolls under Lenis, which overwrites any native jump on the next
 *   frame. Every click now goes through `scrollTo`, which drives Lenis.
 * - **Half the rail was off screen.** Six groups and twenty-four entries are
 *   taller than a laptop screen, and the rail is pinned to the viewport. It now
 *   scrolls on its own (`data-lenis-prevent` lets the wheel reach it instead of
 *   the page), and keeps the current entry in view as the reader moves.
 * - **On a phone it pushed the book a screen down.** Below `lg` the contents
 *   fold behind one button.
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { subscribeToTicker } from "@/lib/animation/ticker";
import { scrollTo } from "@/utils/scroll-to";
import type { Book } from "@/data/books";

/**
 * Where a chapter lands: a little below the top edge, so its number and
 * eyebrow are not flush against the glass. The handbook has no fixed bar to
 * clear, unlike the home page.
 */
const LANDING_OFFSET = -24;

export const HandbookNav = ({ book }: { book: Book }) => {
  const [current, setCurrent] = useState(book.chapters[0].id);
  const [open, setOpen] = useState(false);

  const ids = useRef<string[]>(book.chapters.map((chapter) => chapter.id));
  const rail = useRef<HTMLElement>(null);

  /** A clicked entry holds the marker while the page glides to it. */
  const pinned = useRef<{ id: string; until: number } | null>(null);
  const last = useRef("");

  useEffect(() => {
    return subscribeToTicker(() => {
      const pin = pinned.current;
      if (pin && performance.now() < pin.until) return;
      pinned.current = null;

      const line = window.innerHeight * 0.32;
      let found = ids.current[0];

      for (const id of ids.current) {
        const node = document.getElementById(id);
        if (!node) continue;
        if (node.getBoundingClientRect().top <= line) found = id;
      }

      if (found === last.current) return;
      last.current = found;
      setCurrent(found);
    }, () => 0);
  }, []);

  /**
   * Keep the marked entry inside the rail's own viewport.
   *
   * The rail's `scrollTop` is set directly rather than through
   * `scrollIntoView`, which would also scroll the page — and the page is the
   * thing the reader is driving.
   */
  useEffect(() => {
    const container = rail.current;
    if (!container || container.scrollHeight <= container.clientHeight) return;

    const entry = container.querySelector<HTMLElement>(
      `[data-entry="${current}"]`,
    );
    if (!entry) return;

    const box = container.getBoundingClientRect();
    const row = entry.getBoundingClientRect();
    const margin = 48;

    if (row.top < box.top + margin || row.bottom > box.bottom - margin) {
      const target =
        container.scrollTop +
        (row.top - box.top) -
        container.clientHeight / 2 +
        row.height / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }, [current]);

  const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Modified clicks are the reader asking for a new tab or a copied link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();

    pinned.current = { id, until: performance.now() + 2500 };
    last.current = id;
    setCurrent(id);
    setOpen(false);

    scrollTo(id, {
      offset: LANDING_OFFSET,
      onComplete: () => {
        if (pinned.current?.id === id) pinned.current = null;
      },
    });
  };

  const currentLabel =
    book.nav
      .flatMap((group) => group.links)
      .find((link) => link.id === current)?.label ?? book.nav[0].group;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Phones and small tablets: the contents fold behind one row. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="handbook-contents"
        className="label flex items-center justify-between border border-rule-paper bg-surface-paper px-4 py-3 text-left lg:hidden"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-dim-paper">Contents</span>
          <span className="truncate text-accent">/ {currentLabel}</span>
        </span>
        <span aria-hidden className="text-dim-paper">
          {open ? "−" : "+"}
        </span>
      </button>

      <nav
        id="handbook-contents"
        ref={rail}
        aria-label={`${book.name} contents`}
        data-lenis-prevent
        className={`${
          open ? "flex" : "hidden"
        } mt-4 flex-col gap-7 lg:mt-0 lg:flex lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-10 lg:pr-4 [scrollbar-width:thin]`}
      >
        {book.nav.map((group, index) => (
          <div key={group.group} className="flex flex-col gap-3">
            <span className="text-sm font-medium tracking-tight">
              <span className="text-dim-paper">{index + 1}. </span>
              {group.group}
            </span>

            <ul className="flex flex-col gap-2 border-l border-rule-paper pl-4">
              {group.links.map((link) => {
                const active = link.id === current;

                return (
                  <li key={link.id} className="relative" data-entry={link.id}>
                    {/* The marker sits on the rail itself, so the active row
                        is pointed at rather than merely coloured. */}
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute -left-4 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-accent"
                      />
                    ) : null}

                    <a
                      href={`#${link.id}`}
                      onClick={(event) => jump(event, link.id)}
                      aria-current={active ? "location" : undefined}
                      className={`block py-0.5 text-sm transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent ${
                        active ? "text-accent" : "text-dim-paper"
                      }`}
                    >
                      {link.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
};
