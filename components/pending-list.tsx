"use client";

// Pending transactions list (v1.48.0) — replaces the RAM-25 Inbox bento.
// Same visual family as components/category-picker.tsx (10/18 margins,
// 28px radius, blurred backdrop, 560ms slide-up). Per row: Accept (opens
// the Add Transaction sheet in pending mode, where the user picks the
// ledger) and Delete (inline confirmation).

import { useEffect, useState } from "react";
import { X, Inbox, Sparkles, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { rejectInboxItemAction } from "@/app/actions/inbox";
import { useT } from "@/lib/i18n/provider";
import { formatAmountSigned, formatShortDate } from "@/lib/format";
import { foreignCurrency, pendingDate, type PendingRow } from "@/lib/pending";

type Props = {
  items: PendingRow[];
  /** Ledger currency the user normally works in — used to flag items
   *  reported in another currency. */
  currency: string;
  onClose: () => void;
  /** Called after a row is deleted so the caller can refetch. */
  onChange: () => void;
  /** Hands the item to the caller (Add Transaction sheet, pending mode). */
  onAccept: (item: PendingRow) => void;
};

export default function PendingList({ items, currency, onClose, onChange, onAccept }: Props) {
  const t = useT();
  // Double-RAF enter so the slide-up never gets batched into an instant pop.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let r2: number | null = null;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, []);

  function startClose(after?: () => void) {
    setVisible(false);
    after?.();
    setTimeout(onClose, 560);
  }

  return (
    <div
      onClick={() => startClose()}
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{
        background: visible ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(2px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(2px)" : "blur(0px)",
        transition: visible
          ? "background 560ms ease, backdrop-filter 560ms ease"
          : "background 280ms ease, backdrop-filter 280ms ease",
        padding: "0 10px 18px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col bg-[var(--surface)] text-[var(--foreground)]"
        style={{
          maxHeight: "88%",
          borderRadius: 28,
          padding: "10px 0 16px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          transform: visible ? "translateY(0)" : "translateY(110%)",
          transition: "transform 560ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex shrink-0 justify-center pb-2 pt-1">
          <div className="h-1 w-9 rounded-full bg-black/[0.16]" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-[18px] pb-2.5 pt-1">
          <span className="text-[15px] font-bold">
            {t("pending.title")}
            {items.length > 0 && <span className="text-[var(--label-tertiary)]"> · {items.length}</span>}
          </span>
          <button
            type="button"
            onClick={() => startClose()}
            aria-label={t("common.close")}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div data-scroll className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto px-3 pb-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="h-7 w-7 text-[var(--label-tertiary)]" strokeWidth={1.6} />
              <p className="text-[13.5px] text-[var(--label-secondary)]">{t("pending.empty")}</p>
            </div>
          ) : (
            items.map((it) => (
              <PendingRowCard
                key={it.id}
                item={it}
                currency={currency}
                onChange={onChange}
                onAccept={() => startClose(() => onAccept(it))}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PendingRowCard({
  item,
  currency,
  onChange,
  onAccept,
}: {
  item: PendingRow;
  currency: string;
  onChange: () => void;
  onAccept: () => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = item.parsed ?? {};
  const amount = typeof p.amount === "number" ? p.amount : null;
  const type: "income" | "expense" = p.type === "income" ? "income" : "expense";
  const title = p.name ?? item.raw_subject ?? "Untitled";
  const foreign = foreignCurrency(p, currency);
  const isAgent = item.source_domain === "mcp";

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", item.id);
    const res = await rejectInboxItemAction(fd);
    setBusy(false);
    if (res.ok) onChange();
    else setError(res.error);
  }

  const amountText =
    amount == null
      ? null
      : foreign
      ? `${type === "income" ? "+" : "-"}${foreign} ${amount.toLocaleString("en", { maximumFractionDigits: 2 })}`
      : formatAmountSigned(amount, type, currency);

  return (
    <div className="rounded-[20px] bg-[var(--background)] px-3 py-2.5 ring-1 ring-black/[0.06]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--label-secondary)] ring-1 ring-black/[0.05]">
          {isAgent ? <Sparkles className="h-3.5 w-3.5" strokeWidth={2} /> : <Inbox className="h-3.5 w-3.5" strokeWidth={2} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
            {isAgent ? t("pending.fromAgent") : item.source_domain}
            {p.merchant && p.merchant !== title ? ` · ${p.merchant}` : ""}
          </p>
          <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">{title}</p>
          <p className="truncate text-[12.5px] text-[var(--label-secondary)]">
            {amountText && (
              <>
                <span
                  className={foreign ? "text-amber-700" : type === "income" ? "text-emerald-600" : "text-rose-600"}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {amountText}
                </span>
                {" · "}
              </>
            )}
            {formatShortDate(pendingDate(item))}
            {p.ledger ? ` · → ${p.ledger}` : ""}
          </p>
          {p.note && <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--label-tertiary)]">{p.note}</p>}
        </div>
      </div>

      {foreign && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 ring-1 ring-amber-200">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-700" strokeWidth={2.25} />
          <p className="text-[11.5px] font-medium text-amber-900">
            {t("pending.enterAmountIn")} {currency}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-1.5 truncate rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700 ring-1 ring-rose-200">{error}</p>
      )}

      {confirming ? (
        <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
          <p className="text-[12.5px] font-medium text-rose-700">{t("pending.deleteConfirm")}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="inline-flex h-8 flex-1 items-center justify-center rounded-full bg-white text-[12px] font-semibold text-[var(--foreground)] ring-1 ring-black/[0.08]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-rose-600 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3 w-3" strokeWidth={2.25} />}
              {t("pending.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAccept}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--foreground)] px-3.5 text-[12px] font-semibold text-[var(--on-foreground)]"
          >
            {t("pending.accept")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-rose-600"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
            {t("pending.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
