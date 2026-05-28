"use client";

// Export Transactions shell (RAM-10).
//
// Lives at /settings/export. Two pickers — date range and format — plus
// a primary "Download" / "Share" button that hits the route handler at
// /api/export/transactions, gets a Blob back, and hands it to
// lib/export/deliver.ts. The deliver helper picks between navigator.share
// and an <a download> click depending on runtime capability.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, FileText, FileSpreadsheet, Share2, AlertCircle, Check } from "lucide-react";
import { TapButton } from "@/components/tap";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { canShareFile, deliverFile } from "@/lib/export/deliver";
import { exportFilename } from "@/lib/export/transactions";

type Format = "csv" | "pdf";
type Preset = "7d" | "30d" | "month" | "year" | "custom";

const PRESETS: { key: Preset; labelKey: "export.range.7d" | "export.range.30d" | "export.range.month" | "export.range.year" | "export.range.custom" }[] = [
  { key: "7d",     labelKey: "export.range.7d" },
  { key: "30d",    labelKey: "export.range.30d" },
  { key: "month",  labelKey: "export.range.month" },
  { key: "year",   labelKey: "export.range.year" },
  { key: "custom", labelKey: "export.range.custom" },
];

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangeFor(preset: Preset, now: Date): { start: string; end: string } | null {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "7d") {
    const s = new Date(end); s.setDate(s.getDate() - 6);
    return { start: toDateInputValue(s), end: toDateInputValue(end) };
  }
  if (preset === "30d") {
    const s = new Date(end); s.setDate(s.getDate() - 29);
    return { start: toDateInputValue(s), end: toDateInputValue(end) };
  }
  if (preset === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toDateInputValue(s), end: toDateInputValue(end) };
  }
  if (preset === "year") {
    const s = new Date(now.getFullYear(), 0, 1);
    return { start: toDateInputValue(s), end: toDateInputValue(end) };
  }
  return null;
}

type Props = {
  /** Server-side "now" snapshot, used to seed the default 30-day range so
   *  SSR and the first client render agree. */
  nowISO: string;
};

export default function ExportShell({ nowISO }: Props) {
  const t = useT();
  const router = useRouter();
  const now = useMemo(() => new Date(nowISO), [nowISO]);
  const todayStr = useMemo(() => toDateInputValue(now), [now]);
  const defaultStart = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return toDateInputValue(d);
  }, [now]);

  const [preset, setPreset] = useState<Preset>("30d");
  const [format, setFormat] = useState<Format>("csv");
  const [customStart, setCustomStart] = useState(defaultStart);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brief confirmation chip — shown for ~2.5s after a successful delivery
  // so the user knows the action completed even on platforms where the
  // download UI is invisible (in-app webviews, some TWAs).
  const [done, setDone] = useState<"share" | "download" | null>(null);

  // Resolve the effective range from the preset selector or the custom
  // inputs. Memoised so the disabled/enabled state of the Download button
  // is stable across renders.
  const range = useMemo(() => {
    if (preset === "custom") return { start: customStart, end: customEnd };
    return rangeFor(preset, now) ?? { start: defaultStart, end: todayStr };
  }, [preset, customStart, customEnd, now, defaultStart, todayStr]);

  const rangeValid = range.start && range.end && range.start <= range.end;
  // Probe Web Share with a placeholder File matching the chosen format
  // so the button can read "Share" vs "Download" before the user clicks.
  // Cheap — canShare with a 0-byte file is a feature check, not a real
  // share attempt — and the result is platform-stable.
  const willShare = useMemo(() => {
    if (typeof window === "undefined") return false;
    const probe = new File(
      [new Uint8Array(0)],
      exportFilename(format, range),
      { type: format === "csv" ? "text/csv" : "application/pdf" },
    );
    return canShareFile(probe);
  }, [format, range]);

  async function handleExport() {
    if (!rangeValid || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const url = `/api/export/transactions?format=${format}&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        // Try to surface the JSON error body if the handler returned one;
        // fall back to the status code text otherwise.
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const filename = exportFilename(format, range);
      const result = await deliverFile({
        blob,
        filename,
        shareTitle: filename,
      });
      if (result.method !== "cancelled") setDone(result.method);
      // Auto-clear confirmation chip
      if (result.method !== "cancelled") {
        setTimeout(() => setDone((v) => (v === result.method ? null : v)), 2500);
      }
    } catch (err) {
      console.error("Export failed:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
        <button
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform [touch-action:manipulation]"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("export.title")}
        </h1>
        <div className="h-9 w-9" />
      </header>

      <p className="px-6 pt-2 pb-3 text-[13px] text-[var(--label-secondary)]">
        {t("export.intro")}
      </p>

      {/* ── Format picker ─────────────────────────────────────────────── */}
      <section className="mt-2">
        <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("export.format")}
        </p>
        <div className="mx-5 grid grid-cols-2 gap-2">
          <FormatTile
            label={t("export.format.csv")}
            sub={t("export.format.csv.sub")}
            active={format === "csv"}
            onTap={() => setFormat("csv")}
            icon={<FileSpreadsheet className="h-5 w-5" strokeWidth={2} />}
          />
          <FormatTile
            label={t("export.format.pdf")}
            sub={t("export.format.pdf.sub")}
            active={format === "pdf"}
            onTap={() => setFormat("pdf")}
            icon={<FileText className="h-5 w-5" strokeWidth={2} />}
          />
        </div>
      </section>

      {/* ── Range picker ──────────────────────────────────────────────── */}
      <section className="mt-5">
        <p className="mb-2 px-6 text-[11px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("export.range")}
        </p>
        <div className="mx-5 overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
          {PRESETS.map(({ key, labelKey }) => {
            const sel = preset === key;
            return (
              <TapButton
                key={key}
                onTap={() => setPreset(key)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-3.5 text-left text-[14px] transition-colors [touch-action:manipulation]",
                  sel
                    ? "bg-black/[0.03] font-semibold text-[var(--foreground)]"
                    : "font-medium text-[var(--label-secondary)] active:bg-black/[0.02]",
                )}
              >
                <span>{t(labelKey)}</span>
                {sel && <Check className="h-4 w-4 text-[var(--foreground)]" strokeWidth={2.5} />}
              </TapButton>
            );
          })}
        </div>

        {preset === "custom" && (
          <div className="mx-5 mt-3 grid grid-cols-2 gap-3">
            <DateField
              label={t("export.from")}
              value={customStart}
              max={customEnd || todayStr}
              onChange={setCustomStart}
            />
            <DateField
              label={t("export.to")}
              value={customEnd}
              min={customStart}
              max={todayStr}
              onChange={setCustomEnd}
            />
          </div>
        )}

        {rangeValid && (
          <p className="px-6 pt-2 text-[12px] text-[var(--label-tertiary)]">
            {t("export.rangeSummary")
              .replace("{start}", range.start)
              .replace("{end}", range.end)}
          </p>
        )}
        {!rangeValid && preset === "custom" && (
          <p className="px-6 pt-2 text-[12px] text-rose-600">
            {t("export.rangeInvalid")}
          </p>
        )}
      </section>

      {/* ── Primary action ────────────────────────────────────────────── */}
      <div className="mx-5 mt-6">
        <button
          onClick={handleExport}
          disabled={!rangeValid || busy}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-all active:scale-[0.99]",
            "bg-[var(--foreground)] text-[var(--on-foreground)]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {willShare ? (
            <Share2 className="h-[18px] w-[18px]" strokeWidth={2.25} />
          ) : (
            <Download className="h-[18px] w-[18px]" strokeWidth={2.25} />
          )}
          {busy
            ? t("export.preparing")
            : willShare
              ? t("export.share")
              : t("export.download")}
        </button>

        {/* Status chip beneath the button. Pinned to a fixed-height row
            so the rest of the page doesn't reflow as messages appear and
            vanish. */}
        <div className="mt-3 h-5 text-center text-[12px]">
          {error && (
            <span className="inline-flex items-center gap-1 text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("export.failed")}: {error}
            </span>
          )}
          {!error && done === "share" && (
            <span className="text-[var(--label-secondary)]">{t("export.shared")}</span>
          )}
          {!error && done === "download" && (
            <span className="text-[var(--label-secondary)]">{t("export.downloaded")}</span>
          )}
        </div>
      </div>

      <p className="mx-5 mt-6 text-center text-[11px] leading-relaxed text-[var(--label-tertiary)]">
        {t("export.footer")}
      </p>
    </div>
  );
}

function FormatTile({
  label, sub, active, onTap, icon,
}: { label: string; sub: string; active: boolean; onTap: () => void; icon: React.ReactNode }) {
  return (
    <TapButton
      onTap={onTap}
      className={cn(
        "flex flex-col items-start gap-2 rounded-2xl p-4 text-left transition-all [touch-action:manipulation]",
        active
          ? "bg-[var(--foreground)] text-[var(--on-foreground)] ring-1 ring-[var(--foreground)]"
          : "bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] active:bg-black/[0.02]",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          active ? "bg-white/15" : "bg-black/[0.05]",
        )}
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold">{label}</span>
      <span
        className={cn(
          "text-[12px]",
          active ? "text-white/75" : "text-[var(--label-secondary)]",
        )}
      >
        {sub}
      </span>
    </TapButton>
  );
}

function DateField({
  label, value, min, max, onChange,
}: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block px-1 text-[11px] font-medium text-[var(--label-tertiary)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--foreground)] outline-none ring-1 ring-black/[0.06] focus:ring-[var(--foreground)]/20"
      />
    </label>
  );
}
