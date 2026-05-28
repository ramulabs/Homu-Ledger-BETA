"use client";

/**
 * SeedDemoShell — Developer-only button to seed realistic demo data.
 * Appears under Settings → Developer → Seed Demo Data.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Database, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { seedDemoData, type SeedResult } from "@/app/actions/seed-demo";

export default function SeedDemoShell() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);

  async function handleSeed() {
    setLoading(true);
    setResult(null);
    const r = await seedDemoData();
    setResult(r);
    setLoading(false);
  }

  const isError  = !!result?.error && !result?.alreadySeeded;
  const isSeeded = !!result?.alreadySeeded;
  const isOk     = result && !result.error && !result.alreadySeeded;

  return (
    <div className="pb-10">
      {/* Header */}
      <header className="sticky top-[env(safe-area-inset-top)] z-20 flex items-center justify-between bg-[var(--background)]/95 px-5 pt-2 pb-2 backdrop-blur">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          Seed Demo Data
        </h1>
        <div className="h-9 w-9" />
      </header>

      <div className="mx-5 mt-6 flex flex-col gap-4">
        {/* Info card */}
        <div className="rounded-2xl bg-[var(--surface)] p-5 ring-1 ring-black/[0.04]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--foreground)]/[0.06]">
              <Database className="h-5 w-5 text-[var(--foreground)]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[var(--foreground)]">Indonesian Household Sample</p>
              <p className="text-[13px] text-[var(--label-secondary)]">~90 days of realistic data</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[13px] text-[var(--label-secondary)]">
            {[
              ["4", "Wallets (BCA, Jenius, Cash, CC)"],
              ["14", "Categories (EN + ID)"],
              ["~90", "Transactions (3 months)"],
              ["6", "Recurring items"],
              ["5", "Category budgets"],
            ].map(([n, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="font-semibold text-[var(--foreground)]">{n}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[var(--label-tertiary)] leading-relaxed">
            Data includes: Gaji, GoFood, Indomaret, PLN, IndiHome, Shopee, Gojek, Starbucks, and more. Idempotent — skipped if ≥20 transactions already exist.
          </p>
        </div>

        {/* Result / status */}
        {isSeeded && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3 ring-1 ring-amber-200/60">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">Already seeded</p>
              <p className="text-[13px] text-amber-700 dark:text-amber-400">This household already has ≥20 transactions. Skipped to prevent duplication.</p>
            </div>
          </div>
        )}

        {isError && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3 ring-1 ring-red-200/60">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-red-800 dark:text-red-300">Error</p>
              <p className="text-[13px] text-red-700 dark:text-red-400">{result?.error}</p>
            </div>
          </div>
        )}

        {isOk && result && (
          <div className="rounded-2xl bg-green-50 dark:bg-green-950/30 p-4 flex items-start gap-3 ring-1 ring-green-200/60">
            <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-semibold text-green-800 dark:text-green-300">Demo data seeded ✓</p>
              <ul className="mt-1 text-[13px] text-green-700 dark:text-green-400 space-y-0.5">
                <li>{result.walletsCreated} wallets created</li>
                <li>{result.categoriesCreated} categories created</li>
                <li>{result.transactionsCreated} transactions inserted</li>
                <li>{result.recurringCreated} recurring items created</li>
                <li>{result.budgetsCreated} budgets set</li>
              </ul>
            </div>
          </div>
        )}

        {/* CTA button */}
        <button
          onClick={handleSeed}
          disabled={loading || !!isOk || !!isSeeded}
          className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-4 text-[15px] font-semibold text-[var(--on-foreground)] shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
              Seeding data…
            </>
          ) : isOk ? (
            <>
              <CheckCircle className="h-4 w-4" strokeWidth={2.5} />
              Seeded!
            </>
          ) : (
            <>
              <Database className="h-4 w-4" strokeWidth={2.5} />
              Seed Demo Data
            </>
          )}
        </button>

        {isOk && (
          <button
            onClick={() => router.push("/transactions")}
            className="w-full rounded-2xl bg-[var(--surface)] px-5 py-4 text-[15px] font-semibold text-[var(--foreground)] ring-1 ring-black/[0.05] active:scale-[0.98] transition-transform"
          >
            View Transactions →
          </button>
        )}
      </div>
    </div>
  );
}
