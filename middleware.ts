import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets, images, and public files.
    //
    // The `.well-known/` carve-out is for native-shell discovery files
    // (assetlinks.json for Android TWA, apple-app-site-association for iOS
    // universal links). Both MUST be served at the literal URL with no auth
    // redirect — Chrome on Android and Apple's CDN don't follow 302s.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
