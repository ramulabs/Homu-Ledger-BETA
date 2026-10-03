import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets, images, and public files.
    // /api/version and /api/sw-kill-switch are fetched on every app launch
    // and need no session — running auth on them cost two extra Supabase
    // round-trips per launch (and redirected them to /login when signed out).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/version|api/sw-kill-switch|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
