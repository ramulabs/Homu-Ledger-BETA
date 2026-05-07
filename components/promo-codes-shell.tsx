"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Copy, Check, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { generatePromoCode } from "@/app/actions/promo-codes";
import { cn } from "@/lib/cn";
import type { DbPromoCode, SubscriptionTier } from "@/lib/types";

const TIERS: SubscriptionTier[] = ["3_months", "6_months", "1_year", "lifetime", "developer"];

const TIER_COLORS: Record<SubscriptionTier, { bg: string; text: string }> = {
  "3_months":  { bg: "bg-blue-100",   text: "text-blue-700" },
  "6_months":  { bg: "bg-violet-100", text: "text-violet-700" },
  "1_year":    { bg: "bg-emerald-100", text: "text-emerald-700" },
  "lifetime":  { bg: "bg-amber-100",  text: "text-amber-700" },
  "developer": { bg: "bg-rose-100",   text: "text-rose-700" },
};

type Props = {
  initialCodes: DbPromoCode[];
};

export default function PromoCodesShell({ initialCodes }: Props) {
  const router = useRouter();
  const t = useT();
  const [codes, setCodes] = useState<DbPromoCode[]>(initialCodes);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("3_months");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const byTier = Object.fromEntries(
      TIERS.map((t) => [t, { generated: 0, redeemed: 0 }])
    ) as Record<SubscriptionTier, { generated: number; redeemed: number }>;
    let redeemed = 0;
    for (const c of codes) {
      byTier[c.tier].generated += 1;
      if (c.redeemed_at) {
        byTier[c.tier].redeemed += 1;
        redeemed += 1;
      }
    }
    return { total: codes.length, redeemed, byTier };
  }, [codes]);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    const result = await generatePromoCode(selectedTier);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.code) {
      setCodes((prev) => [result.code!, ...prev]);
    }
  }

  async function handleCopy(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // Clipboard API unavailable — silent fallback (user can long-press)
    }
  }

  return (
    <div className="pb-10">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <button
          onClick={() => router.back()}
          aria-label={t("common.back")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("promo.title")}
        </h1>
        <div className="h-9 w-9" />
      </header>

      <div className="px-5 mt-2">
        <p className="text-[13px] text-[var(--label-secondary)]">{t("promo.subtitle")}</p>
      </div>

      {/* Stats card */}
      <section className="mx-5 mt-4 rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] p-4">
        <div className="grid grid-cols-2 gap-3">
          <StatPill
            label={t("promo.statsGenerated")}
            value={stats.total}
            tone="generated"
          />
          <StatPill
            label={t("promo.statsRedeemed")}
            value={stats.redeemed}
            tone="redeemed"
          />
        </div>
        {/* Per-tier breakdown */}
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {TIERS.map((tier) => (
            <div key={tier} className="flex flex-col items-center rounded-xl bg-[var(--background)] py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--label-tertiary)] truncate w-full text-center">
                {tierShortLabel(tier)}
              </p>
              <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[var(--foreground)]">
                {stats.byTier[tier].redeemed}/{stats.byTier[tier].generated}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Generate */}
      <section className="mx-5 mt-4 rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] p-4">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--label-tertiary)]">
          {t("promo.tier")}
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {TIERS.map((tier) => (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[13px] font-medium ring-1 transition-all",
                selectedTier === tier
                  ? "bg-[var(--foreground)] text-white ring-[var(--foreground)]"
                  : "bg-[var(--background)] text-[var(--foreground)] ring-black/[0.08]"
              )}
            >
              {t(`promo.tier.${tier}` as any)}
            </button>
          ))}
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-[#EE6452] text-[14px] font-semibold text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {generating ? t("promo.generating") : t("promo.generate")}
        </button>
        {error && (
          <p className="mt-2 rounded-xl bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}
      </section>

      {/* Codes list */}
      <section className="mx-5 mt-5">
        {codes.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface)] px-4 py-10 text-center text-[14px] text-[var(--label-secondary)] ring-1 ring-black/[0.04]">
            {t("promo.empty")}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-[var(--surface)] ring-1 ring-black/[0.04] divide-y divide-[var(--separator)]">
            {codes.map((c) => {
              const isRedeemed = !!c.redeemed_at;
              const tierColor = TIER_COLORS[c.tier];
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[15px] font-semibold tracking-[0.04em] text-[var(--foreground)] truncate">
                        {c.code}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tierColor.bg} ${tierColor.text}`}>
                          {t(`promo.tier.${c.tier}` as any)}
                        </span>
                        {isRedeemed ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {t("promo.statusRedeemed")}
                            {c.redeemer?.name ? ` · ${c.redeemer.name}` : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[var(--label-tertiary)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--label-secondary)]">
                            {t("promo.statusAvailable")}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isRedeemed && (
                      <button
                        onClick={() => handleCopy(c.id, c.code)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-[var(--label-secondary)] ring-1 ring-black/[0.06] active:scale-95 transition-transform"
                        aria-label={t("promo.copy")}
                      >
                        {copiedId === c.id ? (
                          <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
                        ) : (
                          <Copy className="h-4 w-4" strokeWidth={2} />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: "generated" | "redeemed" }) {
  const bg = tone === "redeemed" ? "bg-emerald-100/70 text-emerald-700" : "bg-[#EE6452]/15 text-[#EE6452]";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--background)] p-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full ${bg}`}>
        <Sparkles className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--label-tertiary)]">{label}</p>
        <p className="text-[20px] font-semibold tabular-nums text-[var(--foreground)] leading-tight">{value}</p>
      </div>
    </div>
  );
}

function tierShortLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case "3_months":  return "3M";
    case "6_months":  return "6M";
    case "1_year":    return "1Y";
    case "lifetime":  return "Life";
    case "developer": return "Dev";
  }
}
