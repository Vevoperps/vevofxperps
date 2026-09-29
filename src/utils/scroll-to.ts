/**
 * Moving the page, through the thing that actually owns the page's position.
 *
 * **Why this is not `window.scrollTo`.** Lenis runs its own loop: every frame
 * it reads the position it believes the page should be at and writes that to
 * the document. A native scroll, an `href="#section"` jump, anything that sets
 * the position behind its back, is therefore undone on the very next frame.
 * The page twitches and stays where it was, which is exactly what a dead
 * anchor looks like.
 *
 * So every deliberate move goes through Lenis when Lenis is running, and falls
 * back to the browser only when it is not — on a route with smooth scrolling
 * off, or before the controller has mounted.
 *
 * **Why `force` and never `lock`.** Lenis ignores `scrollTo` while a locked
 * scroll is still running. With `lock: true`, a second click on a nav item
 * during the first one's glide did nothing at all — the button that seemed to
 * stick. A click must always win, so the move is forced and left
 * interruptible.
 */

import { useScroll } from "@/hooks/smooth-scroll/use-scroll";

/** A section id, a `#id`, an element, or an absolute offset in pixels. */
export type ScrollTarget = string | number | HTMLElement;

export interface ScrollOptions {
  /** Jump instead of gliding. */
  immediate?: boolean;
  /**
   * Pixels to stop short of the target (negative = above it). Defaults to
   * clearing the home page's fixed bar, 3.25rem with its padding; pages
   * without that bar pass their own.
   */
  offset?: number;
  /** Called once the page has arrived (or been interrupted by a newer move). */
  onComplete?: () => void;
}

const HEADER_OFFSET = -52;

const asSelector = (target: string): string =>
  target.startsWith("#") ? target : `#${target}`;

export const scrollTo = (
  target: ScrollTarget,
  options: boolean | ScrollOptions = {},
): void => {
  // The first version took `immediate` as a bare boolean; keep that working.
  const {
    immediate = false,
    offset = HEADER_OFFSET,
    onComplete,
  }: ScrollOptions =
    typeof options === "boolean" ? { immediate: options } : options;

  const shift = typeof target === "number" ? 0 : offset;
  const lenis = useScroll.getState().lenis;

  if (lenis) {
    lenis.scrollTo(typeof target === "string" ? asSelector(target) : target, {
      immediate,
      offset: shift,
      force: true,
      lock: false,
      onComplete: onComplete ? () => onComplete() : undefined,
    });
    return;
  }

  const top =
    typeof target === "number"
      ? target
      : (() => {
          const node =
            typeof target === "string"
              ? document.getElementById(asSelector(target).slice(1))
              : target;
          if (!node) return null;
          return node.getBoundingClientRect().top + window.scrollY + shift;
        })();

  if (top === null) {
    onComplete?.();
    return;
  }
  window.scrollTo({ top, behavior: immediate ? "instant" : "smooth" });
  // The browser gives no completion event for a smooth scroll; this is only
  // used to release a highlight, so an estimate is enough.
  if (onComplete) window.setTimeout(onComplete, immediate ? 0 : 700);
};
