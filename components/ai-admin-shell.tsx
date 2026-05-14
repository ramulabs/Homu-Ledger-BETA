"use client";

// Client shell for the AI dev panel. Renders the API key form + this-
// month usage rollup. Talks to app/actions/ai.ts via Server Actions —
// no direct Supabase access here, which keeps secrets on the server.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Sparkles, Check, AlertTriangle, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";
import { saveGeminiKey, clearGeminiKey, testGeminiConnection } from "@/app/actions/ai";

type Stats = {
  calls: number;
  totalTokens: number;
  cost: number;
  hits: number;
  misses: number;
  errors: number;
  hitRate: number | null;
};

type Props = {
  keyConfigured: boolean;
  keyUpdatedAt: string | null;
  stats: Stats;
};

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; category: string; tokens: number; model: string }
  | { status: "fail"; error: string; unconfigured?: boolean };

export default function AiAdminShell({ keyConfigured, keyUpdatedAt, stats }: Props) {
  const router = useRouter();
  const t = useT();
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    const res = await saveGeminiKey(keyInput);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setKeyInput("");
    setSaved(true);
    // Soft refresh so the page recomputes keyConfigured + updated_at.
    router.refresh();
  }

  async function handleClear() {
    setError(null);
    setSaved(false);
    setClearing(true);
    const res = await clearGeminiKey();
    setClearing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function handleTest() {
    setTest({ status: "running" });
    const res = await testGeminiConnection();
    if (res.ok) {
      setTest({ status: "ok", category: res.category, tokens: res.tokens, model: res.model });
    } else {
      setTest({ status: "fail", error: res.error, unconfigured: res.unconfigured });
    }
  }

  return (
    <div className="pb-10">
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
        <button
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("ai.admin.title")}
        </h1>
        <div className="h-9 w-9" />
      </header>

      <p className="px-5 mt-2 text-[13px] text-[var(--label-secondary)]">
        {t("ai.admin.subtitle")}
      </p>

      {/* API key card */}
      <section className="mx-5 mt-4 rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] p-4">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("ai.admin.keyHeading")}
        </p>

        {/* Status hint above the input — "Key is configured" or the
            longer get-a-key-from-AI-studio explainer. */}
        <p className="mb-2 text-[12px] text-[var(--label-secondary)]">
          {keyConfigured ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
              {t("ai.admin.keyMaskedHint")}
              {keyUpdatedAt && (
                <span className="text-[var(--label-tertiary)]">
                  · {new Date(keyUpdatedAt).toLocaleString()}
                </span>
              )}
            </span>
          ) : (
            t("ai.admin.keyHint")
          )}
        </p>

        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={t("ai.admin.keyPlaceholder")}
          spellCheck={false}
          autoComplete="off"
          className="h-11 w-full rounded-2xl bg-[var(--background)] px-4 text-[14px] font-mono text-[var(--foreground)] outline-none ring-1 ring-black/[0.08] placeholder:text-[var(--label-tertiary)] focus:ring-2 focus:ring-[var(--foreground)]/20 transition-shadow"
        />

        <div className="mt-3 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || keyInput.trim().length === 0}
            className="flex h-11 flex-1 items-center justify-center rounded-2xl bg-[#EE6452] text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? t("common.saving") : t("ai.admin.keySave")}
          </button>
          <button
            onClick={handleTest}
            disabled={test.status === "running"}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--background)] text-[14px] font-semibold text-[var(--foreground)] ring-1 ring-black/[0.08] disabled:opacity-60"
          >
            {test.status === "running" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                {t("ai.admin.keyTesting")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                {t("ai.admin.keyTest")}
              </>
            )}
          </button>
          {keyConfigured && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex h-11 items-center justify-center rounded-2xl px-3 text-[13px] font-medium text-rose-600 disabled:opacity-60"
            >
              {clearing ? "…" : t("ai.admin.keyClear")}
            </button>
          )}
        </div>

        {/* Inline test result. Stays visible until the next test or
            save so the dev can read it. */}
        {test.status === "ok" && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 ring-1 ring-emerald-200">
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            {t("ai.admin.testOk")
              .replace("{category}", test.category)
              .replace("{tokens}", String(test.tokens))}
            <span className="ml-auto text-[var(--label-tertiary)] font-mono">{test.model}</span>
          </p>
        )}
        {test.status === "fail" && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            {t("ai.admin.testFail").replace("{error}", test.error)}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 ring-1 ring-emerald-200">
            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            {t("common.saved")}
          </p>
        )}
      </section>

      {/* Usage card */}
      <section className="mx-5 mt-5 rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] p-4">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("ai.admin.usageHeading")}
        </p>

        {stats.calls === 0 ? (
          <p className="rounded-xl bg-[var(--background)] px-3 py-3 text-[13px] text-[var(--label-secondary)] text-center">
            {t("ai.admin.usageEmpty")}
          </p>
        ) : (
          <>
            {/* Headline row — Hit rate is the most important number for
                the cache-first strategy ("are we actually saving money?"). */}
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label={t("ai.admin.usageHitRate")}
                value={stats.hitRate === null ? "—" : `${Math.round(stats.hitRate * 100)}%`}
                tone="primary"
              />
              <Stat
                label={t("ai.admin.usageCost")}
                value={`$${stats.cost.toFixed(4)}`}
                tone="primary"
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniStat label={t("ai.admin.usageCalls")} value={String(stats.calls)} />
              <MiniStat label={t("ai.admin.usageTokens")} value={formatNumber(stats.totalTokens)} />
              <MiniStat
                label={t("ai.admin.usageHits")}
                value={String(stats.hits)}
                tone="ok"
              />
              <MiniStat
                label={t("ai.admin.usageMisses")}
                value={String(stats.misses)}
              />
              <MiniStat
                label={t("ai.admin.usageErrors")}
                value={String(stats.errors)}
                tone={stats.errors > 0 ? "warn" : "neutral"}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-3",
        tone === "primary" ? "bg-[#EE6452]/10" : "bg-[var(--background)]"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--label-tertiary)]">
        {label}
      </p>
      <p className="mt-0.5 text-[22px] font-semibold leading-tight text-[var(--foreground)] tabular-nums">
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-rose-700"
      : "text-[var(--foreground)]";
  return (
    <div className="rounded-xl bg-[var(--background)] px-3 py-2 ring-1 ring-black/[0.04]">
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--label-tertiary)]">
        {label}
      </p>
      <p className={cn("mt-0.5 text-[15px] font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
