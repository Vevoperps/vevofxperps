import Image from "next/image";

import { Action, ActionGhost } from "@/components/ui/action";
import { Chip, Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { GridField } from "@/views/home/grid-field";
import { TypedWord } from "@/views/home/typed-word";
import { brand } from "@/lib/brand";
import { LogoMark } from "@/lib/logo";
import { hero } from "@/data/content";

/**
 * First screen: a dark gridded panel that answers the cursor, then the
 * statement on paper under it.
 *
 * The grid used to be two repeating gradients. It is a canvas now — see
 * `grid-field.tsx` for why — and the panel's only other job is to be the dark
 * thing the wordmark sits on and the thing the page emerges from when the
 * curtain lifts.
 *
 * The headline is three lines with the middle one typed, which is the shape
 * the reference uses: the sentence stays still and one bracketed word keeps
 * being rewritten inside it.
 */
export const Hero = () => (
  <section className="relative">
    <div className="relative h-[42vh] min-h-[18rem] w-full overflow-hidden bg-surface-ink">
      <GridField />

      {/* `pointer-events-none` so the whole panel stays hoverable — the canvas
          under this row is what tracks the cursor. */}
      <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-[90rem] items-center justify-between px-5 sm:px-8">
        <Reveal y={16} className="flex items-center gap-3">
          {/* The logo, sized to the wordmark beside it: a touch taller than
              the lowercase, so the two read as one lock-up rather than an
              icon next to a word. The hairline keeps the blue square from
              dissolving into the dark grid behind it. */}
          <span className="flex items-center gap-2.5">
            <LogoMark className="size-[1.875rem] shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0.5rem_1.5rem_-0.5rem_rgba(0,26,255,0.6)]" />
            <span className="text-[1.5rem] font-medium leading-none tracking-tight text-ink-on-ink">
              {brand.name}
              <sup className="ml-0.5 align-super text-[0.5em] text-dim-ink">®</sup>
            </span>
          </span>
          <Chip tone="ink">{brand.version}</Chip>
        </Reveal>

        <Reveal y={16} delay={120} className="hidden sm:block">
          <Label tone="ink">{hero.scrollHint} ↓</Label>
        </Reveal>
      </div>
    </div>

    {/* The statement. */}
    <div className="border-t border-rule-paper bg-surface-paper">
      <div className="mx-auto grid w-full max-w-[90rem] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div>
          <Reveal y={14}>
            <Chip>{hero.badge}</Chip>
          </Reveal>
          <Reveal y={24} delay={90}>
            <h1 className="mt-8 text-[2.75rem] font-medium leading-[1.02] tracking-tight sm:text-[4rem]">
              {hero.headline.lead}
              <br />
              <TypedWord
                words={hero.typed}
                className="font-display text-[1.2em] leading-[0.85] text-accent"
              />
              <br />
              {hero.headline.tail}
            </h1>
          </Reveal>
        </div>

        <div className="flex flex-col justify-end gap-8">
          <Reveal y={20} delay={160} className="flex items-center gap-4">
            <span className="flex -space-x-2" aria-hidden>
              {["jp", "eu", "br"].map((code) => (
                <Image
                  key={code}
                  src={`/flags/${code}.svg`}
                  alt=""
                  width={22}
                  height={16}
                  className="h-4 w-[22px] border border-rule-paper object-cover"
                />
              ))}
            </span>
            <Label>{hero.trust.label}</Label>
            <span className="h-3 w-px bg-rule-paper" />
            <Label strong>{hero.trust.score}</Label>
          </Reveal>

          <Reveal y={20} delay={220}>
            <p className="max-w-[46ch] text-base leading-relaxed text-dim-paper">
              {hero.lede}
            </p>
          </Reveal>

          <Reveal y={20} delay={280} className="flex flex-wrap items-center gap-6">
            <Action href={brand.links.app}>{hero.primary}</Action>
            <ActionGhost section="markets">{hero.secondary}</ActionGhost>
          </Reveal>
        </div>
      </div>
    </div>
  </section>
);
