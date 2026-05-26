"use client";

// Inbox bento — RAM-25 Phase 1.
//
// Floating bento sheet showing pending email-derived transactions. Same
// visual family as components/category-picker.tsx (10/18 margins, 28px
// radius, blurred backdrop, 560ms slide-up). Per row: Confirm (one-tap
// when parsed) + Reject. The Edit-via-Add-Transaction flow ships in
// sub-PR 5.

import { useEffect, useState } from "react";
import { X, Mailbox, Check, Trash2, Pencil, AlertTriangle, Loader2 } from "lucide-react";
import {
  acceptInboxItemAction,
  rejectInboxItemAction,
} from "@/app/actions/inbox";

export type InboxRow = {
  id: string;
  source_domain: string;
  sender_email: string;
  raw_subject: string | null;
  received_at: string;
  parsed: {
    amount?: number;
    type?: string;
    name?: string;
    date?: string;
    currency?: string;
  } | null;
  parse_confidence: number | null;
  parse_method: string | null;
};

type Props = {
  items: InboxRow[];
  /** Fired the instant the bento starts its exit so the caller can hide
   *  the chip / refresh state in sync. Optional. */
  onCloseStart?: () => void;
  onClose: () => void;
  /** Called after a row is accepted or rejected so the caller can
   *  refresh its data. */
  onChange?: () => void;
  /** Optional: when provided, each row shows an Edit button that hands
   *  the inbox item off to the caller (typically AddTransactionSheet
   *  with the parsed fields pre-filled). The bento closes immediately
   *  after the hand-off so the sheet can take over the screen. */
  onEdit?: (item: InboxRow) => void;
};

export default function InboxBento({
  items,
  onClose,
  onCloseStart,
  onChange,
  onEdit,
}: Props) {
  // Double-RAF enter — same trick as category-picker so the slide-up
  // never gets batched into an instant pop.
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

  function startClose() {
    setVisible(false);
    onCloseStart?.();
    setTimeout(onClose, 560);
  }

  function handleEditRow(item: InboxRow) {
    onEdit?.(item);
    startClose();
  }

  return (
    <div
      onClick={startClose}
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
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          transform: visible ? "translateY(0)" : "translateY(110%)",
          transition: "transform 560ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pb-2 pt-1">
          <div className="h-1 w-9 rounded-full bg-black/[0.16]" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-[18px] pb-2.5 pt-1">
          <span className="text-[15px] font-bold">
            Inbox — {items.length} to review
          </span>
          <button
            type="button"
            onClick={startClose}
            aria-label="Close"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/[0.05] text-[var(--label-secondary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        {/* List */}
        <div className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto px-3 pb-1">
          {items.length === 0 ? (
            <div className="col-span-1 flex flex-col items-center gap-2 py-10 text-center">
              <Mailbox
                className="h-7 w-7 text-[var(--label-tertiary)]"
                strokeWidth={1.6}
              />
              <p className="text-[13.5px] text-[var(--label-secondary)]">
                Nothing waiting. Forward a bank email to your inbox address
                to journal it here.
              </p>
            </div>
          ) : (
            items.map((it) => (
              <InboxRowCard
                key={it.id}
                item={it}
                onChange={onChange}
                onEdit={onEdit ? () => handleEditRow(it) : undefined}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function InboxRowCard({
  item,
  onChange,
  onEdit,
}: {
  item: InboxRow;
  onChange?: () => void;
  onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = item.parsed ?? null;
  const amount = typeof parsed?.amount === "number" ? parsed.amount : null;
  const name = typeof parsed?.name === "string" ? parsed.name : null;
  const type = parsed?.type ?? null;
  const conf = item.parse_confidence ?? null;

  // Per PRD, one-tap Confirm is only safe when confidence is high.
  // Phase 1 sources are either manual (confidence = 1.0) or raw (no
  // parsed data at all); the 0.85 threshold still tracks the right
  // semantics for when the parser ships in Phase 2.
  const canConfirm = !!parsed && (conf == null || conf >= 0.85) && type !== "transfer" && type !== null && !!amount && !!name;
  const lowConfidence = !!parsed && conf != null && conf < 0.85;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", item.id);
    const res = await acceptInboxItemAction(fd);
    setBusy(false);
    if (res.ok) {
      onChange?.();
    } else {
      setError(res.error);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("id", item.id);
    const res = await rejectInboxItemAction(fd);
    setBusy(false);
    if (res.ok) {
      onChange?.();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="rounded-[20px] bg-[var(--background)] px-3 py-2.5 ring-1 ring-black/[0.06]">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--label-secondary)] ring-1 ring-black/[0.05]">
          <Mailbox className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
            {item.source_domain}
          </p>
          <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
            {name ?? item.raw_subject ?? "Untitled"}
          </p>
          <p className="truncate text-[12.5px] text-[var(--label-secondary)]">
            {amount != null ? (
              <>
                <span
                  className={type === "income" ? "text-emerald-600" : "text-rose-600"}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {type === "income" ? "+" : "-"}Rp {amount.toLocaleString("id-ID")}
                </span>
                {" · "}
              </>
            ) : null}
            {formatRelative(item.received_at)}
          </p>
        </div>
      </div>

      {lowConfidence && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 ring-1 ring-amber-200">
          <AlertTriangle
            className="h-3 w-3 shrink-0 text-amber-700"
            strokeWidth={2.25}
          />
          <p className="text-[11.5px] font-medium text-amber-900">
            Low confidence — please open in Add Transaction to edit.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-1.5 truncate rounded-md bg-rose-50 px-2 py-1 text-[11.5px] text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        {canConfirm && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--foreground)] px-3 text-[12px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
            ) : (
              <Check className="h-3 w-3" strokeWidth={2.5} />
            )}
            Confirm
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className={
              canConfirm
                ? "inline-flex h-8 items-center gap-1 rounded-full bg-black/[0.05] px-3 text-[12px] font-semibold text-[var(--foreground)] transition-opacity disabled:opacity-60"
                : "inline-flex h-8 items-center gap-1 rounded-full bg-[var(--foreground)] px-3 text-[12px] font-semibold text-[var(--on-foreground)] transition-opacity disabled:opacity-60"
            }
          >
            <Pencil className="h-3 w-3" strokeWidth={2.25} />
            Edit
          </button>
        )}
        {!canConfirm && !onEdit && (
          <span className="inline-flex h-8 items-center rounded-full bg-black/[0.05] px-3 text-[12px] font-medium text-[var(--label-secondary)]">
            Needs editing
          </span>
        )}
        <button
          type="button"
          onClick={handleReject}
          disabled={busy}
          aria-label="Reject"
          className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-rose-600 transition-opacity disabled:opacity-60"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2} />
          Reject
        </button>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} d ago`;
  return new Date(iso).toLocaleDateString();
}
