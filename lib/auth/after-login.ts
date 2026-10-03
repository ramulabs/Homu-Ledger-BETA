// Return-to-after-login for the OAuth consent screen.
//
// When an MCP client (Gemini Spark, Claude, …) sends a signed-out user to
// /oauth/consent, middleware stores that URL in a short-lived cookie and
// bounces to /login. Whichever login path the user then takes (password or
// Google) sends them back to the consent screen instead of /transactions.
// Only /oauth/consent paths are ever honoured, so the cookie can't be used
// as an open redirect.

import { cookies } from "next/headers";

export const AFTER_LOGIN_COOKIE = "homu_after_login";
export const AFTER_LOGIN_MAX_AGE = 600; // seconds — OAuth authorization IDs expire quickly anyway

export function isSafeAfterLoginPath(path: string | undefined | null): path is string {
  return typeof path === "string" && path.startsWith("/oauth/consent") && !path.startsWith("//");
}

/** Read and clear the pending return path (server actions / route handlers). */
export async function consumeAfterLoginPath(): Promise<string | null> {
  const store = await cookies();
  const path = store.get(AFTER_LOGIN_COOKIE)?.value;
  if (!path) return null;
  store.delete(AFTER_LOGIN_COOKIE);
  return isSafeAfterLoginPath(path) ? path : null;
}
