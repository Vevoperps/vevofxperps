"use client";

/**
 * A link to a section of the home page that leaves the address bar at `/`.
 *
 * **Why not `href="/#fees"`.** A hash link writes `#fees` into the URL, where
 * it outlives the click: it gets copied into shares, and every later return to
 * the page honours it instead of where the reader actually was. The home page
 * is one address, so it keeps one address.
 *
 * - **On the home page** the click is intercepted and the page glides to the
 *   section through Lenis (see `utils/scroll-to.ts`). The URL does not change.
 * - **From any other page** (`/app`, `/docs`, the legal pages) the section is
 *   left in `sessionStorage`, the router goes to `/`, and `ScrollLayout` picks
 *   it up on arrival and scrolls there — again without a hash.
 *
 * The rendered `href` is `/`, so a middle-click or "open in new tab" still
 * lands on the home page, just at the top.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { scrollTo } from "@/utils/scroll-to";

/** Read by `ScrollLayout` when a route change lands on `/`. */
export const PENDING_SECTION_KEY = "vevo:goto";

/** `0` means the very top of the page. */
export type SectionTarget = string | 0;

export const goToSection = (
  section: SectionTarget,
  pathname: string | null,
  push: (href: string) => void,
): void => {
  if (pathname === "/") {
    scrollTo(section);
    return;
  }

  try {
    sessionStorage.setItem(PENDING_SECTION_KEY, String(section));
  } catch {
    // Storage blocked: the reader still reaches the home page, at the top.
  }
  push("/");
};

export const SectionLink = ({
  section,
  className,
  children,
  label,
}: {
  section: SectionTarget;
  className?: string;
  children: ReactNode;
  /** Accessible name, for a link whose content is an icon. */
  label?: string;
}) => {
  const pathname = usePathname();
  const router = useRouter();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks mean a new tab or window; let the browser have them.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    goToSection(section, pathname, (href) => router.push(href));
  };

  return (
    <Link href="/" scroll={false} onClick={onClick} aria-label={label} className={className}>
      {children}
    </Link>
  );
};
