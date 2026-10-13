import { Suspense } from "react";
import { requireSession } from "@/lib/auth/session";
import HelpShell from "@/components/help-shell";
import StickyHeader from "@/components/ui/sticky-header";

export default async function HelpPage() {
  const { user } = await requireSession();

  return (
    <div className="pb-10">
      <StickyHeader title="Help & Feedback" backHref="/settings" />

      {/* HelpShell reads `useSearchParams()` to remember the active tab —
          wrap in Suspense so Next can stream the rest of the page even if
          search params aren't yet resolved on first paint. */}
      <Suspense fallback={null}>
        <HelpShell userId={user.id} />
      </Suspense>
    </div>
  );
}
