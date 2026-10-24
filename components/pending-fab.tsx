"use client";

// Floating "Pending transactions" button (v1.48.0). Sits where the old
// "Speak to add" sparkle FAB lived — bottom-right, just above the bottom
// nav — and only appears while something is waiting for review, with a
// count badge. Replaces the RAM-25 "N to review" chip.
//
// Self-fetching: reads the signed-in user's pending inbox_items through the
// browser client (RLS "select own"), and refetches on tab focus or when the
// parent bumps `refreshSignal` (after an accept).

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/provider";
import PendingList from "@/components/pending-list";
import { PENDING_SELECT, type PendingRow } from "@/lib/pending";

type Props = {
  currency: string;
  onAccept: (item: PendingRow) => void;
  refreshSignal?: number;
  resolvedItemIds?: string[];
};
const NO_RESOLVED_ITEMS: string[] = [];

export default function PendingFab({ currency, onAccept, refreshSignal = 0, resolvedItemIds = NO_RESOLVED_ITEMS }: Props) {
  const t = useT();
  const [items, setItems] = useState<PendingRow[]>([]);
  const [open, setOpen] = useState(false);
  const removedIds = useRef(new Set<string>());
  const refreshRequest = useRef(0);
  useEffect(() => {
    for (const id of resolvedItemIds) removedIds.current.add(id);
  }, [resolvedItemIds]);

  const load = useCallback(
    () =>
      createClient()
        .from("inbox_items")
        .select(PENDING_SELECT)
        .eq("status", "pending")
        .order("received_at", { ascending: false }),
    []
  );
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    try {
      const { data, error } = await load();
      if (!error && request === refreshRequest.current) setItems(((data ?? []) as PendingRow[]).filter((item) => !removedIds.current.has(item.id)));
    } catch { /* Preserve the current list when a background refresh fails. */ }
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const request = ++refreshRequest.current;
    Promise.resolve(load()).then(({ data, error }) => {
      if (!cancelled && !error && request === refreshRequest.current) setItems(((data ?? []) as PendingRow[]).filter((item) => !removedIds.current.has(item.id)));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load, refreshSignal]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const visibleItems = items.filter((item) => !resolvedItemIds.includes(item.id));
  const count = visibleItems.length;

  return (
    <>
      {count > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t("pending.title")}: ${count}`}
          className="fixed z-[49] inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[0_10px_22px_rgba(238,100,82,0.35)] active:scale-95 [touch-action:manipulation]"
          style={{
            right: 18,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
            background: "#EE6452",
            animation: "speak-fab-in 360ms cubic-bezier(.22,1,.36,1) both",
          }}
        >
          <Inbox className="h-[22px] w-[22px]" strokeWidth={2.25} />
          <span
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold ring-2"
            style={{ color: "#EE6452", ["--tw-ring-color" as string]: "#EE6452" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        </button>
      )}

      {open && (
        <PendingList
          items={visibleItems}
          currency={currency}
          onClose={() => setOpen(false)}
          onChange={(id) => {
            removedIds.current.add(id);
            setItems((previous) => previous.filter((item) => item.id !== id));
            void refresh();
          }}
          onAccept={onAccept}
        />
      )}
    </>
  );
}
