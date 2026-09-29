import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, handle } from "@/lib/api";
import { TOKEN_PAGE_COOKIE, tokenPagePassword, tokenPageToken } from "@/lib/gate";

/**
 * Issues the cookie that opens the locked $VEVO page.
 *
 * Same arrangement as `/api/gate`: the code is compared here, never in the
 * browser, and what the browser gets back is an httpOnly cookie holding a
 * token derived from the code rather than the code itself.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  password: z.string().min(1).max(200),
});

/** A month: long enough for the team, short enough to lapse after launch. */
const MAX_AGE = 60 * 60 * 24 * 30;

export const POST = handle(async (req) => {
  const { password } = schema.parse(await req.json());

  const https =
    req.headers.get("x-forwarded-proto") === "https" ||
    req.nextUrl.protocol === "https:";

  if (password.trim() !== tokenPagePassword()) {
    throw new ApiError(401, "invalid_code", "Invalid access code.");
  }

  const response = NextResponse.json({ data: { granted: true } }, { status: 200 });

  response.cookies.set({
    name: TOKEN_PAGE_COOKIE,
    value: tokenPageToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: MAX_AGE,
  });

  return response;
});
