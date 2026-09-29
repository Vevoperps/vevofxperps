"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

import { useScroll } from "@/hooks/smooth-scroll/use-scroll";
import { PENDING_SECTION_KEY } from "@/components/ui/section-link";
import { scrollTo } from "@/utils/scroll-to";

export const scrollSpeed = { current: 1 };

export function ScrollLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-layout">
      <div className="scroll-layout-content">{children}</div>
      <ScrollController />
    </div>
  );
}

/** Where each route was left, for the length of one browsing session. */
const KEY = "vevo:scroll:";

const remember = (pathname: string, offset: number): void => {
  try {
    sessionStorage.setItem(KEY + pathname, String(Math.round(offset)));
  } catch {
    // Private windows and blocked storage. Losing the position is a smaller
    // failure than throwing inside a scroll handler.
  }
};

/** Reads and clears the section `SectionLink` left for the home page. */
const takePendingSection = (): string | null => {
  try {
    const value = sessionStorage.getItem(PENDING_SECTION_KEY);
    if (value !== null) sessionStorage.removeItem(PENDING_SECTION_KEY);
    return value;
  } catch {
    return null;
  }
};

const recall = (pathname: string): number => {
  try {
    return Number(sessionStorage.getItem(KEY + pathname) ?? 0);
  } catch {
    return 0;
  }
};

/**
 * Smooth scrolling, and the three things that depend on it.
 *
 * **Restoring the position on back.** The controller used to call
 * `window.scrollTo(0, 0)` on mount, unconditionally. That is correct for a
 * fresh visit and wrong for every other case: a reader who opened the app from
 * the middle of the page and pressed back was thrown to the hero, having lost
 * the place they were reading. So the position of each route is remembered as
 * it is scrolled, and a `popstate` marks the next route change as a return
 * rather than a departure. Forward navigation still starts at the top.
 *
 * `history.scrollRestoration` is set to manual for the same reason: with both
 * the browser and this code restoring, the two disagree and the page jumps
 * twice.
 *
 * **Route changes.** This controller lives in the root layout and is not
 * remounted between routes, so Lenis carries its position across a navigation.
 * Landing on a short page with a tall page's offset pins it to the foot, which
 * is why opening the privacy policy used to start at the end of it. Every
 * route change now tells Lenis where it is.
 *
 * **Hashes.** `usePathname()` does not include the hash, so the old check for
 * one could never be true. The hash is read from `window.location`.
 */
function ScrollController() {
  const isEnableScroll = useScroll((state) => state.isEnableScroll);
  const [lenis, setLenis] = useScroll(
    useShallow((state) => [state.lenis, state.setLenis]),
  );

  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const returning = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const instance = new Lenis({ smoothWheel: true });
    (window as typeof window & { lenis: Lenis }).lenis = instance;
    setLenis(instance);

    let rafId = 0;
    const raf = (time: number) => {
      instance.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      // Cancel the loop before destroying Lenis, or it keeps calling `raf` on a
      // destroyed instance after unmount or a hot reload.
      cancelAnimationFrame(rafId);
      instance.destroy();
      setLenis(null);
    };
  }, [setLenis]);

  // A back or forward press. The flag is read by the route effect below, which
  // runs after it, and cleared there.
  useEffect(() => {
    const onPop = () => {
      returning.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Remember where this route is, as it moves.
  useEffect(() => {
    if (!pathname) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remember(pathname, window.scrollY);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      remember(pathname, window.scrollY);
    };
  }, [pathname]);

  useEffect(() => {
    if (!lenis || !pathname) return;
    if (previousPath.current === pathname) return;

    const first = previousPath.current === null;
    previousPath.current = pathname;

    const hash = window.location.hash.slice(1);
    const back = returning.current;
    returning.current = false;

    // The target has to exist before it can be scrolled to, and on a route
    // change it is rendered a frame or two later. Two frames is enough for the
    // layout to settle without the visible pause a timeout would add.
    const run = (action: () => void) =>
      requestAnimationFrame(() => requestAnimationFrame(action));

    // **A return beats a hash.** The hash branch used to come first, and a
    // stale `#section` left in the address bar therefore decided where every
    // later visit to this route landed: leave the page from the country list,
    // press back, arrive at whatever was last clicked in the nav. What the
    // reader left is what the reader gets back.
    if (back) {
      const offset = recall(pathname);

      // Restoring once is not enough on a page that is still assembling. The
      // sections reveal on springs and the rates table fills from the network,
      // so the document grows for a second after the route settles and a
      // position applied at frame two ends up in the wrong place. Applying it
      // again as the height changes costs nothing and lands it.
      const land = () => {
        const limit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        lenis.scrollTo(Math.min(offset, limit), {
          immediate: true,
          force: true,
        });
      };

      run(land);
      const timers = [120, 320, 640].map((delay) =>
        window.setTimeout(land, delay),
      );
      return () => timers.forEach(window.clearTimeout);
    }

    // **A section asked for from another page.** `SectionLink` leaves it here
    // instead of in the URL, so the home page is reached at plain `/`. Applied
    // more than once for the same reason as a return: the page is still
    // assembling when it lands, and the target moves as it does.
    const pending = pathname === "/" ? takePendingSection() : null;
    if (pending !== null) {
      const target = pending === "0" ? 0 : pending;
      const land = () => scrollTo(target, { immediate: true });
      run(land);
      const timers = [120, 320, 640].map((delay) =>
        window.setTimeout(land, delay),
      );
      return () => timers.forEach(window.clearTimeout);
    }

    if (hash) {
      run(() => scrollTo(hash, true));
      // An old `/#fees` link still lands on Fees, and the address is then
      // tidied back to `/` — the home page keeps one address. Other routes
      // (`/docs#margin`) keep their hash; it is how a chapter is shared.
      if (pathname === "/") {
        history.replaceState(history.state, "", pathname + window.location.search);
      }
      return;
    }

    // A fresh visit is already at the top, and forcing it there again fights
    // a browser that has its own opinion during hydration.
    if (!first) lenis.scrollTo(0, { immediate: true, force: true });
  }, [lenis, pathname]);

  useEffect(() => {
    if (isEnableScroll) {
      lenis?.start();
      enableNativeScroll(true);
    } else {
      lenis?.stop();
      enableNativeScroll(false);
    }
  }, [isEnableScroll, lenis]);

  return null;
}

const enableNativeScroll = (value: boolean) => {
  if (typeof document === "undefined") return;
  const html = document.querySelector("html");
  if (!html) return;

  if (!value) {
    html.style.position = "relative";
    html.style.overflow = "hidden";
    html.style.height = "100%";
  } else {
    html.style.removeProperty("position");
    html.style.removeProperty("overflow");
    html.style.removeProperty("height");
  }
};
