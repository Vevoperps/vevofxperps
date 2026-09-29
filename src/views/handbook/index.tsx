import Link from "next/link";

import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { TypeIn } from "@/components/ui/type-in";
import { HandbookNav } from "@/views/handbook/handbook-nav";
import type { Block, Book } from "@/data/books";
import { books } from "@/data/books";
import { brand } from "@/lib/brand";

/**
 * A handbook, as one long page with a sticky contents rail.
 *
 * One page rather than a route per chapter: each book is a fifteen minute
 * read, and a reader who has to click eight times to learn what liquidation
 * means will not get there. The rail tracks the scroll instead, so the
 * structure stays visible without becoming a navigation task.
 *
 * The blue does the work of structure rather than decoration: the chapter
 * number, the rule under each heading, the current entry in the rail, the term
 * at the head of a list row, the figures, and the left edge of a note. Body
 * text is never blue, which is what keeps a page of it readable.
 *
 * Both books render through here — see `data/books.ts`.
 */
const Blocks = ({ blocks }: { blocks: Block[] }) => (
  <div className="mt-7 flex max-w-[64ch] flex-col gap-5">
    {blocks.map((block, position) => {
      if (block.kind === "figures") {
        return (
          <Reveal
            key={position}
            y={16}
            delay={60}
            className="grid grid-cols-2 gap-px border border-rule-paper bg-rule-paper sm:grid-cols-4"
          >
            {block.figures?.map((figure) => (
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
          </Reveal>
        );
      }

      if (block.kind === "list") {
        return (
          <Reveal
            key={position}
            y={16}
            delay={60}
            tag="ul"
            className="flex flex-col gap-3"
          >
            {block.items?.map((item) => (
              <li
                key={item.term}
                className="flex gap-3 text-[0.9375rem] leading-relaxed"
              >
                <span
                  aria-hidden
                  className="mt-[0.55em] size-[5px] shrink-0 bg-accent"
                />
                <span>
                  <b className="font-medium text-accent">{item.term}</b>
                  <span className="text-dim-paper"> {item.body}</span>
                </span>
              </li>
            ))}
          </Reveal>
        );
      }

      if (block.kind === "note") {
        return (
          <Reveal
            key={position}
            y={16}
            delay={60}
            className="border-l-2 border-accent bg-accent/[0.06] px-5 py-4 text-[0.9375rem] leading-relaxed"
          >
            {block.body}
          </Reveal>
        );
      }

      return (
        <Reveal
          key={position}
          y={16}
          delay={60}
          tag="p"
          className="text-[0.9375rem] leading-relaxed text-dim-paper"
        >
          {block.body}
        </Reveal>
      );
    })}
  </div>
);

export const HandbookView = ({ book }: { book: Book }) => (
  <main className="bg-surface-paper-2">
    <div className="mx-auto w-full max-w-[86rem] px-5 sm:px-8">
      <div className="grid gap-0 lg:grid-cols-[17rem_1fr]">
        {/*
          Pinned to the viewport on desktop, and exactly one viewport tall.
          The header part keeps its size; the contents take what is left and
          scroll inside it — see `handbook-nav.tsx`. Without the `min-h-0`
          chain the rail grew past the screen and its lower half was simply
          unreachable, because the page scrolling does not move a pinned rail.
        */}
        <aside className="border-rule-paper lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-r">
          <div className="flex h-full min-h-0 flex-col gap-6 py-8 lg:gap-7 lg:py-10 lg:pr-4">
            <Link
              href="/"
              className="label flex shrink-0 items-center gap-2 text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent"
            >
              <span aria-hidden>&lt;</span>
              {book.back}
            </Link>

            <div className="flex shrink-0 flex-col gap-2">
              <span className="text-xl font-medium tracking-tight">
                {brand.name}
                <span className="text-dim-paper"> / {book.name.toLowerCase()}</span>
              </span>
              <Label>{book.title}</Label>
            </div>

            {/* The other book, one line, so the two are never dead ends. */}
            <div className="flex shrink-0 flex-col gap-2 border-y border-rule-paper py-4 lg:mr-4">
              {books.map((other) => (
                <Link
                  key={other.path}
                  href={other.path}
                  aria-current={other.path === book.path ? "page" : undefined}
                  className={`label flex items-center justify-between transition-colors duration-[var(--duration-fast)] ease-entrance hover:text-accent ${
                    other.path === book.path ? "text-accent" : "text-dim-paper"
                  }`}
                >
                  {other.name}
                  <span aria-hidden>{other.path === book.path ? "•" : "→"}</span>
                </Link>
              ))}
            </div>

            <HandbookNav book={book} />
          </div>
        </aside>

        <article className="min-w-0 bg-surface-paper px-6 py-12 sm:px-12 lg:py-16">
          <header className="border-b border-rule-paper pb-10">
            <Label>{book.name}</Label>
            <h1 className="mt-4 max-w-[20ch] text-[2.25rem] font-medium leading-[1.06] tracking-tight sm:text-[3rem]">
              <TypeIn block text={book.title} delay={240} />
            </h1>
            <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-relaxed text-dim-paper">
              {book.lede}
            </p>
          </header>

          {book.chapters.map((chapter, index) => (
            <section
              key={chapter.id}
              id={chapter.id}
              className="scroll-mt-8 border-rule-paper pt-12 [&+section]:border-t"
            >
              <Reveal y={20} className="flex flex-col gap-4">
                <span className="flex items-center gap-3">
                  {/* The chapter number, in the accent: the rail and the page
                      agree on where you are without either shouting. */}
                  <span className="label bg-accent px-2 py-1.5 pt-2 text-ink-on-ink">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Label>{chapter.eyebrow}</Label>
                </span>

                <h2 className="max-w-[24ch] text-[1.75rem] font-medium leading-[1.15] tracking-tight sm:text-[2.25rem]">
                  {chapter.title}
                </h2>

                <span aria-hidden className="block h-[2px] w-16 bg-accent" />
              </Reveal>

              <div className="pb-14">
                <Blocks blocks={chapter.blocks} />
              </div>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule-paper pt-8">
            <Link
              href="/"
              className="label flex items-center gap-3 border-b border-rule-paper pb-3 text-dim-paper transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent hover:text-accent"
            >
              <span aria-hidden>&lt;</span>
              {book.back}
            </Link>

            {books
              .filter((other) => other.path !== book.path)
              .map((other) => (
                <Link
                  key={other.path}
                  href={other.path}
                  className="label flex items-center gap-3 border-b border-accent pb-3 text-accent"
                >
                  {other.name}
                  <span aria-hidden>→</span>
                </Link>
              ))}
          </div>
        </article>
      </div>
    </div>
  </main>
);
