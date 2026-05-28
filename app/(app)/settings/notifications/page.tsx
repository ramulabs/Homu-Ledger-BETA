// RAM-9 — Notifications settings page.
//
// Server wrapper that loads the user's existing subscriptions + the
// VAPID public key, then hands them to the client shell. The shell
// handles the runtime gate (iOS native shows "coming soon" instead of
// the toggle) and the actual subscribe/permission dance.

import { ChevronLeft } from "lucide-react";
import { TapLink } from "@/components/tap";
import { requireSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import { listUserSubscriptions } from "@/app/actions/push";
import NotificationsShell from "@/components/notifications-shell";

export default async function NotificationsPage() {
  await requireSession();
  const { t } = await getServerT();
  const subs = await listUserSubscriptions();

  // The public key is a NEXT_PUBLIC_ env var, so it inlines at build
  // time on the client. But the server can read it here too — passing
  // through props avoids relying on the client-side env handling at
  // hydration time (one less moving part).
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  return (
    <div className="pb-12">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
        <TapLink
          href="/settings"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform [touch-action:manipulation]"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </TapLink>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("notif.title")}
        </h1>
        <div className="h-9 w-9" />
      </header>

      <p className="mx-5 mt-2 text-[13px] text-[var(--label-secondary)]">
        {t("notif.subtitle")}
      </p>

      <NotificationsShell
        initialSubscriptions={subs}
        vapidPublicKey={vapidPublicKey}
      />
    </div>
  );
}
