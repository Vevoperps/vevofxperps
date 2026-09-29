import type { Metadata } from "next";
import { cookies } from "next/headers";

import { app } from "@/data/app";
import { TOKEN_PAGE_COOKIE, tokenPageLocked, tokenPageToken } from "@/lib/gate";
import { AppVevo } from "@/views/app/vevo";
import { AppVevoLock } from "@/views/app/vevo-lock";

export const metadata: Metadata = { title: app.vevo.title };

/**
 * The $VEVO page, closed for maintenance until the launch patch.
 *
 * Checked on the server, per request: the real page is not sent to anyone
 * without the cookie `/api/token-page` issues. To reopen it for everyone,
 * set `TOKEN_PAGE_LOCK=off` in Vercel, or delete the lock check below.
 */
export default async function Page() {
  const jar = await cookies();
  const open =
    !tokenPageLocked() ||
    jar.get(TOKEN_PAGE_COOKIE)?.value === tokenPageToken();

  return open ? <AppVevo /> : <AppVevoLock />;
}
