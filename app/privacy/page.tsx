import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy · Homu",
  description: "How Homu handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[var(--background)]">
      <header className="flex items-center gap-3 px-5 pt-4 pb-2">
        <Link
          href="/settings"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--foreground)] ring-1 ring-black/[0.05] shadow-[0_1px_2px_rgba(0,0,0,0.03)] active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.25} />
        </Link>
        <h1 className="text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
          Privacy Policy
        </h1>
      </header>

      <main className="px-6 pt-4 pb-12 text-[14px] leading-relaxed text-[var(--foreground)]">
        <p className="text-[12px] uppercase tracking-wide text-[var(--label-tertiary)]">
          Last updated: May 8, 2026
        </p>

        <p className="mt-4">
          Homu is a personal finance app for tracking household transactions.
          This document describes what data we collect and how we use it.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">What we collect</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1.5">
          <li>
            <strong>Account:</strong> email address, password (stored hashed),
            display name, optional username, and avatar colour.
          </li>
          <li>
            <strong>Ledger data:</strong> the household name, currency, symbol,
            opening balance, transactions (description, amount, type, category,
            wallet, date, member), categories, wallets, and recurring items you
            create.
          </li>
          <li>
            <strong>Receipts:</strong> any photos you choose to attach to a
            transaction. Photos are stored in private storage with access
            limited to members of your household.
          </li>
          <li>
            <strong>Subscription:</strong> the promo code you redeemed and the
            tier / expiry it grants.
          </li>
        </ul>
        <p className="mt-3">
          We do <strong>not</strong> collect device contacts, location,
          microphone, camera roll, biometrics, or analytics about your usage.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">How we use it</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1.5">
          <li>
            To sign you in, render your ledger, and let other members of the
            same household see shared transactions.
          </li>
          <li>To send invitations to people you explicitly invite by email or username.</li>
          <li>
            To compute your reports (totals, breakdowns, charts) — all of this
            happens on our servers against your own data, not aggregated with
            anyone else&rsquo;s.
          </li>
        </ul>
        <p className="mt-3">
          We do not sell your data, share it with advertisers, or use it to
          train AI models.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">Where it lives</h2>
        <ul className="mt-2 list-disc pl-5 space-y-1.5">
          <li>
            <strong>Supabase</strong> (Singapore region) — Postgres database for
            your records, plus storage for receipt photos. Row-level security
            ensures only you and the members of your household can read your data.
          </li>
          <li>
            <strong>Vercel</strong> — serves the app and runs server actions.
            Brief request logs are kept for operational debugging and aren&rsquo;t
            associated with your ledger contents.
          </li>
        </ul>

        <h2 className="mt-6 text-[15px] font-semibold">Your rights</h2>
        <p className="mt-2">
          You can export, correct, or delete your data at any time. To delete
          your account and all associated data, email us at the address below.
          If you remove yourself from a shared ledger, your past entries remain
          attributed to you so the other members&rsquo; reports stay accurate;
          deleting your account anonymises those rows.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">Children</h2>
        <p className="mt-2">
          Homu is not directed at children under 13 and we do not knowingly
          collect data from them.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">Changes</h2>
        <p className="mt-2">
          When we update this policy, we&rsquo;ll change the date at the top of
          this page. For material changes we&rsquo;ll surface a notice in the app
          before they take effect.
        </p>

        <h2 className="mt-6 text-[15px] font-semibold">Contact</h2>
        <p className="mt-2">
          Questions about this policy or your data:{" "}
          <a className="font-medium underline" href="mailto:hello@ramulabs.com">
            hello@ramulabs.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}
