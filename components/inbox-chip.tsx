"use client";

// Home-screen "N to review" chip — RAM-25 Phase 1.
//
// Self-contained: fetches its own count of pending inbox_items via the
// browser supabase client (RLS scopes the query to the signed-in user)
// and opens the InboxBento on tap. Hides itself entirely when there's
// nothing to review.

import { useCallback, useEffect, useState } from "react";
import { Mailbox, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import InboxBento, { type InboxRow } from "@/components/inbox-bento";

type Props = {
  /** Optional: when set, the bento shows an Edit button on each row
   *  that hands the inbox item to the parent (typically to open the
   *  Add Transaction sheet pre-filled). */
  onEdit?: (item: InboxRow) => void;
  /** Optional: parent bumps this to force a refetch after an
   *  out-of-band change (e.g. the edit-via-Add-Transaction flow
   *  finishing). */
  refreshSignal?: number;
};

export default function InboxChip({ onEdit, refreshSignal = 0 }: Props) {
  const [items, setItems] = useState<InboxRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("inbox_items")
      .select(
        "id, source_domain, sender_email, raw_subject, received_at, parsed, parse_confidence, parse_method"
      )
      .eq("status", "pending")
      .order("received_at", { ascending: false });
    setItems((data ?? []) as InboxRow[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  // Refresh when the page becomes visible again (user came back from
  // somewhere else — e.g. swiped between PWAs).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  if (!loaded || items.length === 0) return null;

  return (
    <>
      <div className="px-5 pt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-2xl bg-[var(--surface)] px-3.5 py-2.5 ring-1 ring-black/[0.06] active:scale-[0.99] transition-transform [touch-action:manipulation]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--foreground)]/[0.06] text-[var(--foreground)]">
            <Mailbox className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span className="flex-1 text-left text-[13.5px] font-semibold text-[var(--foreground)]">
            {items.length} transaction{items.length === 1 ? "" : "s"} to review
          </span>
          <ChevronRight
            className="h-4 w-4 text-[var(--label-tertiary)]"
            strokeWidth={2.25}
          />
        </button>
      </div>

      {open && (
        <InboxBento
          items={items}
          onClose={() => setOpen(false)}
          onChange={refresh}
          onEdit={onEdit}
        />
      )}
    </>
  );
}
