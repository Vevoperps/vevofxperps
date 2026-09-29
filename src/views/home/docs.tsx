import Link from "next/link";

import { Action } from "@/components/ui/action";
import { HoverType } from "@/components/ui/hover-type";
import { Label } from "@/components/ui/label";
import { Num } from "@/components/ui/num";
import { Reveal } from "@/components/ui/reveal";
import { Rule } from "@/components/ui/rule";
import { TypeIn } from "@/components/ui/type-in";
import { Section } from "@/components/ui/section";
import { DocPreview } from "@/views/home/doc-preview";
import { SECTION_COUNT, sectionIndex, docs } from "@/data/content";
import type { Book } from "@/data/books";

/**
 * Only what the thumbnail draws: the rail and the first two chapters, which
 * is more than an A4 sheet holds. The preview
 * is a client component, so whatever is passed to it is serialised into the
 * page; the full books would add both handbooks' text to every home load.
 */
const preview = (book: Book): Book => ({
  ...book,
  chapters: book.chapters.slice(0, 2),
});

/** Both books' names, for the switcher at the top of each thumbnail's rail. */
const shelf = docs.books.map((entry) => ({
  path: entry.book.path,
  name: entry.book.name,
}));

/**
 * The two books, each shown as the page it opens on.
 *
 * The section is built the way the reference builds it: the argument stays on
 * the left — heading, one action, two short paragraphs, and nothing else — and
 * the right half is given over entirely to the cards, which run to the section's
 * own edge rather than sitting in the text column. That asymmetry is what makes
 * the row read as a shelf.
 *
 * Each card is one object in three bands: its name and tags, then the page on
 * its dotted ground, then the footer that opens it. The page is drawn rather
 * than screenshotted — see `doc-preview.tsx`.
 *
 * `href` is null until each book is published, so the footer says `soon` and
 * the card is a `div` rather than a link to nowhere.
 */
export const Docs = () => (
  <Section id={docs.head.id} tone="paper">
    <Reveal y={12} className="flex items-center gap-4">
      <span className="label whitespace-nowrap">
        <span className="text-dim-paper">[N.</span>
        <span>{String(sectionIndex(docs.head.id)).padStart(2, "0")}</span>
        <span className="text-dim-paper">
          /{String(SECTION_COUNT).padStart(2, "0")}]
        </span>
      </span>
      <Rule className="w-8 bg-rule-paper" delay={80} />
      <TypeIn
        text={`> ${docs.head.label}`}
        className="label text-dim-paper"
        delay={120}
      />
      <Rule className="flex-1 bg-rule-paper" delay={160} />
    </Reveal>

    <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
      {/* The argument. It sits at the top of its column and lets the cards be
          the tall thing on the row. */}
      <div className="flex flex-col">
        <Reveal y={24}>
          <h2 className="max-w-[18ch] text-[2.25rem] font-medium leading-[1.05] tracking-tight sm:text-[3rem]">
            {docs.head.heading[0]}
            <br />
            <span className="text-dim-paper">{docs.head.heading[1]}</span>
          </h2>
        </Reveal>

        <Reveal y={24} delay={120} className="mt-auto pt-16">
          <Action href={docs.books[0].href}>{docs.head.action}</Action>
        </Reveal>

        <Reveal y={24} delay={180} className="mt-10 flex flex-col gap-4">
          <p className="max-w-[40ch] text-sm leading-relaxed">{docs.lede}</p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-dim-paper">
            {docs.body}
          </p>
        </Reveal>
      </div>

      <div className="grid gap-px border border-rule-paper bg-rule-paper sm:grid-cols-2">
        {docs.books.map((book, index) => (
          <div key={book.n} className="bg-surface-paper">
            {/* A published book is a real link, an unpublished one is inert —
                the footer says which it is. */}
            <Reveal
              y={32}
              delay={index * 130}
              tag={book.href ? "a" : "div"}
              href={book.href ?? undefined}
              className="group flex h-full flex-col"
            >
              <div className="flex flex-col gap-3 p-6">
                <h3 className="text-xl font-medium leading-tight tracking-tight">
                  {book.title}
                </h3>
                <p className="label text-dim-paper">
                  {book.tags.join("  ")}
                </p>
                <span className="mt-8 block">
                  <Num value={book.n} />
                </span>
              </div>

              {/* The page, whole: the book's real first screen shrunk to fit
                  the card, on the dotted ground. On hover it lifts off the
                  ground and its shadow deepens. The panel's padding is the
                  headroom for that lift, and nothing here clips — so the page
                  rises whole instead of being cut by the card. */}
              <div className="dotfield-panel border-y border-rule-paper p-5">
                <div className="border border-rule-paper bg-surface-paper shadow-[0_1rem_2rem_-1rem_rgba(0,0,0,0.25)] transition-[transform,box-shadow,border-color] duration-[var(--duration-slow)] ease-entrance group-hover:-translate-y-2 group-hover:border-accent group-hover:shadow-[0_1.75rem_2.5rem_-1rem_rgba(0,0,0,0.35)]">
                  <DocPreview book={preview(book.book)} shelf={shelf} />
                </div>
              </div>

              <div className="flex items-center justify-between p-5">
                <span
                  aria-hidden
                  className="label text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance group-hover:text-accent"
                >
                  ↗
                </span>
                <span className="label text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance group-hover:text-accent">
                  <HoverType text={book.href ? docs.view : "Soon"} />
                </span>
              </div>
            </Reveal>
          </div>
        ))}
      </div>
    </div>
  </Section>
);
