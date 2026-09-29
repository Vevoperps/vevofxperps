"use client";

/**
 * A handbook's first screen, drawn at full size and shrunk to a thumbnail.
 *
 * **Why it is built this way.** The first version typeset the page directly at
 * thumbnail size — 4px body, 3px captions — and at those sizes the browser
 * rounds, clamps and truncates until the page no longer looks like the page it
 * advertises: half-sentences, uneven lines, a rail cut short. It read as
 * unfinished.
 *
 * So the page is laid out the way `/docs` lays itself out — same rail, same
 * header, same chapter opening, same type sizes and rules — inside a fixed
 * 80 × 50rem "screen", and the whole screen is then scaled down to the card's
 * width with one `transform`. What the card shows is what the reader gets on
 * click, only smaller.
 *
 * The scale is measured, not guessed: the site's root font size adapts to the
 * viewport (see `AdaptiveGrid`), so the screen's pixel width varies, and a
 * `ResizeObserver` keeps the fit exact through every resize. Until the first
 * measurement the frame is transparent rather than drawn at the wrong size.
 *
 * Nothing here is a placeholder: every word comes from `data/books.ts`, so
 * editing a chapter updates the thumbnail with it.
 */

import { useEffect, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import type { Block, Book } from "@/data/books";
import { brand } from "@/lib/brand";

/**
 * The two books' names and paths, for the rail's switcher. Passed in rather
 * than imported: importing `books` here would ship both handbooks' full text
 * in the home page's JavaScript just to print two titles.
 */
export type Shelf = { path: string; name: string }[];

/** The chapter's first few blocks, as the real page sets them. */
const PreviewBlock = ({ block }: { block: Block }) => {
  if (block.kind === "figures") {
    return (
      <span className="grid grid-cols-4 gap-px border border-rule-paper bg-rule-paper">
        {block.figures?.slice(0, 4).map((figure) => (
          <span
            key={figure.caption}
            className="flex flex-col gap-1.5 bg-surface-paper px-4 py-5"
          >
            <b className="text-[1.5rem] font-medium leading-none tracking-tight text-accent">
              {figure.value}
            </b>
            <Label>{figure.caption}</Label>
          </span>
        ))}
      </span>
    );
  }

  if (block.kind === "list") {
    return (
      <span className="flex flex-col gap-3">
        {block.items?.map((item) => (
          <span
            key={item.term}
            className="flex gap-3 text-[0.9375rem] leading-relaxed"
          >
            <span aria-hidden className="mt-[0.55em] size-[5px] shrink-0 bg-accent" />
            <span>
              <b className="font-medium text-accent">{item.term}</b>
              <span className="text-dim-paper"> {item.body}</span>
            </span>
          </span>
        ))}
      </span>
    );
  }

  if (block.kind === "note") {
    return (
      <span className="block border-l-2 border-accent bg-accent/[0.06] px-5 py-4 text-[0.9375rem] leading-relaxed">
        {block.body}
      </span>
    );
  }

  return (
    <span className="block text-[0.9375rem] leading-relaxed text-dim-paper">
      {block.body}
    </span>
  );
};

/** The real page's first screen, at the real page's sizes. */
const Screen = ({ book, shelf }: { book: Book; shelf: Shelf }) => {
  const chapter = book.chapters[0];

  return (
    <span className="flex h-full w-full bg-surface-paper-2 text-foreground">
      {/* The rail. */}
      <span className="flex w-[17rem] shrink-0 flex-col gap-7 overflow-hidden border-r border-rule-paper py-10 pl-8 pr-4">
        <span className="label flex items-center gap-2 text-dim-paper">
          <span>&lt;</span>
          {book.back}
        </span>

        <span className="flex flex-col gap-2">
          <span className="text-xl font-medium tracking-tight">
            {brand.name}
            <span className="text-dim-paper"> / {book.name.toLowerCase()}</span>
          </span>
          <Label>{book.title}</Label>
        </span>

        <span className="mr-4 flex flex-col gap-2 border-y border-rule-paper py-4">
          {shelf.map((other) => (
            <span
              key={other.path}
              className={`label flex items-center justify-between ${
                other.path === book.path ? "text-accent" : "text-dim-paper"
              }`}
            >
              {other.name}
              <span>{other.path === book.path ? "•" : "→"}</span>
            </span>
          ))}
        </span>

        <span className="flex flex-col gap-7">
          {book.nav.map((group, index) => (
            <span key={group.group} className="flex flex-col gap-3">
              <span className="text-sm font-medium tracking-tight">
                <span className="text-dim-paper">{index + 1}. </span>
                {group.group}
              </span>
              <span className="flex flex-col gap-2 border-l border-rule-paper pl-4">
                {group.links.map((link, position) => {
                  const active = index === 0 && position === 0;
                  return (
                    <span key={link.id} className="relative block">
                      {active ? (
                        <span className="absolute -left-4 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-accent" />
                      ) : null}
                      <span
                        className={`block py-0.5 text-sm ${
                          active ? "text-accent" : "text-dim-paper"
                        }`}
                      >
                        {link.label}
                      </span>
                    </span>
                  );
                })}
              </span>
            </span>
          ))}
        </span>
      </span>

      {/* The page. */}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-paper px-12 py-16">
        <span className="block border-b border-rule-paper pb-10">
          <Label>{book.name}</Label>
          <span className="mt-4 block max-w-[20ch] text-[3rem] font-medium leading-[1.06] tracking-tight">
            {book.title}
          </span>
          <span className="mt-4 block max-w-[52ch] text-[0.9375rem] leading-relaxed text-dim-paper">
            {book.lede}
          </span>
        </span>

        <span className="flex flex-col gap-4 pt-12">
          <span className="flex items-center gap-3">
            <span className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink">01</span>
            <Label>{chapter.eyebrow}</Label>
          </span>
          <span className="block max-w-[24ch] text-[2.25rem] font-medium leading-[1.15] tracking-tight">
            {chapter.title}
          </span>
          <span className="block h-[2px] w-16 bg-accent" />
        </span>

        <span className="mt-7 flex max-w-[64ch] flex-col gap-5">
          {chapter.blocks.slice(0, 4).map((block, index) => (
            <PreviewBlock key={index} block={block} />
          ))}
        </span>
      </span>
    </span>
  );
};

export const DocPreview = ({ book, shelf }: { book: Book; shelf: Shelf }) => {
  const box = useRef<HTMLSpanElement>(null);
  const screen = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const outer = box.current;
    const inner = screen.current;
    if (!outer || !inner) return;

    const fit = () => {
      const width = inner.offsetWidth;
      if (width > 0) setScale(outer.clientWidth / width);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={box}
      aria-hidden
      // 16:10, the screen's own proportion, so the whole page fits the frame
      // with nothing cropped at the bottom.
      className="relative block aspect-[16/10] w-full overflow-hidden"
    >
      <span
        ref={screen}
        className="absolute left-0 top-0 block h-[50rem] w-[80rem] origin-top-left"
        style={{
          transform: `scale(${scale ?? 0.25})`,
          opacity: scale === null ? 0 : 1,
        }}
      >
        <Screen book={book} shelf={shelf} />
      </span>
    </span>
  );
};
