import { redirect } from "next/navigation";
import BottomNav from "@/components/bottom-nav";
import SideNav from "@/components/side-nav";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getServerT } from "@/lib/i18n/server";
import { requireSession } from "@/lib/auth/session";
import DevFeedbackNotifier from "@/components/dev-feedback-notifier";
import SyncStatusPill from "@/components/sync-status-pill";
import SyncReplay from "@/components/sync-replay";
import VersionGate from "@/components/version-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireSession() + getServerT() share ONE getSession() resolution via
  // React.cache — same auth.getUser() and profile SELECT serve the layout,
  // every page underneath, every server-side i18n lookup. v1.23.0 closes
  // the SSR cookie-refresh race for good (see lib/auth/session.ts).
  await requireSession();
  const { lang, isDeveloper, username } = await getServerT();

  // Google-OAuth users who haven't picked a username yet land here if they
  // type a URL directly (the OAuth callback already routes them to
  // /auth/setup on first sign-in, but a refresh or direct nav lands here).
  // Existing email/password users always have a username, so this is a
  // no-op for them.
  if (username === null) {
    redirect("/auth/setup");
  }

  return (
    <LanguageProvider lang={lang}>
      {/*
       * Two-column layout on md+ (iPad / desktop):
       *   ┌──────────┬──────────────────────────────┐
       *   │ SideNav  │  main content (max-w-[720px]) │
       *   │  w-60    │                               │
       *   └──────────┴──────────────────────────────┘
       *
       * On mobile (< md): unchanged narrow column + BottomNav.
       * SideNav is hidden on mobile via hidden md:flex.
       * BottomNav is hidden on md+ via md:hidden.
       */}
      <div className="bg-[var(--background)] md:flex md:min-h-dvh">
        <SideNav />

        {/* Mobile: narrow centred column. Desktop: flex-1 with centred content. */}
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col md:mx-0 md:max-w-none md:flex-1">
          {/*
           * Status-bar shield — only relevant on iOS native (safe-area-inset-top
           * is 0 on desktop/browser) so it's harmless to leave it unconditional.
           * On md+ it's hidden so the fixed strip doesn't overlap the SideNav.
           */}
          <div
            aria-hidden
            className="fixed left-0 right-0 top-0 z-30 bg-[var(--background)]/95 backdrop-blur md:hidden"
            style={{ height: "env(safe-area-inset-top)" }}
          />
          {/*
           * paddingTop: safe-area-inset-top handles iOS notch/Dynamic Island.
           * paddingBottom: uses --app-bottom-pad CSS variable (defined in
           *   globals.css). Mobile: 7rem + safe-area (clears floating BottomNav).
           *   md+: 2rem (BottomNav is hidden, normal breathing room only).
           */}
          <main
            className="flex-1 md:mx-auto md:w-full md:max-w-[720px]"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "var(--app-bottom-pad)",
            }}
          >
            {children}
          </main>
          <BottomNav />
        </div>
      </div>
      <SyncStatusPill />
      <SyncReplay />
      <VersionGate />
      {isDeveloper && <DevFeedbackNotifier />}
    </LanguageProvider>
  );
}
