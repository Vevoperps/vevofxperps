import type { ReactNode } from "react";

import { SectionLink } from "@/components/ui/section-link";
import type { Tone } from "@/components/ui/tone";
import { toneClasses } from "@/components/ui/tone";

/**
 * The primary action: a solid block with a square marker and a mono caps label.
 *
 * Rendered as a `<span>` when there is nowhere to send people yet. A button
 * that does nothing when pressed is worse than one that reads as a label, and
 * every destination on this page is still null in `lib/brand.ts`.
 */
export const Action = ({
  children,
  href = null,
  tone = "paper",
}: {
  children: ReactNode;
  href?: string | null;
  tone?: Tone;
}) => {
  const body = (
    <>
      <span className="size-2 bg-accent" aria-hidden />
      <span className="label">{children}</span>
    </>
  );
  const shell =
    tone === "ink"
      ? "bg-surface-paper text-foreground"
      : "bg-surface-ink text-ink-on-ink";

  const className = `inline-flex items-center gap-3 px-5 py-3.5 transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-accent hover:text-ink-on-ink ${shell}`;

  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <span className={className} aria-disabled="true">
      {body}
    </span>
  );
};

/**
 * The secondary action: a label over a full-width rule.
 *
 * `section` makes it a jump to a part of the home page that keeps the address
 * at `/` — see `section-link.tsx`. It wins over `href`.
 */
export const ActionGhost = ({
  children,
  href = null,
  section,
  tone = "paper",
}: {
  children: ReactNode;
  href?: string | null;
  section?: string;
  tone?: Tone;
}) => {
  const t = toneClasses(tone);
  const className = `inline-flex min-w-[10rem] items-center justify-between gap-6 border-b pb-3 pt-3.5 ${t.rule} transition-colors duration-[var(--duration-fast)] ease-entrance hover:border-accent`;
  const body = (
    <>
      <span className="label">{children}</span>
      <span className="label text-accent" aria-hidden>
        →
      </span>
    </>
  );

  if (section) {
    return (
      <SectionLink section={section} className={className}>
        {body}
      </SectionLink>
    );
  }

  return href ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <span className={className} aria-disabled="true">
      {body}
    </span>
  );
};
