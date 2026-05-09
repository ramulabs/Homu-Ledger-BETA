import BottomNav from "@/components/bottom-nav";
import { LanguageProvider } from "@/lib/i18n/provider";
import { getServerT } from "@/lib/i18n/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getServerT();
  return (
    <LanguageProvider lang={lang}>
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[var(--background)]">
        {/* Surface-coloured strip pinned to the bottom safe-area zone of the
            iPhone (the home-indicator area). iOS PWA standalone clips
            `position: fixed; bottom: 0` at the visual viewport boundary, so
            the bottom nav and sheet popups end above the home indicator and
            expose a strip of page background. This filler sits behind
            everything (z-0, pointer-events-none) and is the same colour as
            the bottom nav and the sheets, so the strip blends in instead of
            showing the cream page bg. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-0 bg-[var(--surface)]"
          style={{ height: "env(safe-area-inset-bottom)" }}
        />
        <main
          className="flex-1"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(7rem + env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </main>
        <BottomNav />
      </div>
    </LanguageProvider>
  );
}
