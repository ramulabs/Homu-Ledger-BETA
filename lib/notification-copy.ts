// RAM-9 — Bilingual copy for the three notification types.
//
// The Settings dictionaries (lib/i18n/dictionaries.ts) cover the
// SETTINGS UI; this module covers the notification BODIES themselves.
// Kept separate because:
//   1. These strings are server-rendered by cron jobs that don't have a
//      React tree → no point routing them through the React i18n
//      provider.
//   2. Each string takes runtime arguments (amount, item name,
//      percent) that string interpolation in the dictionary file
//      would obscure.
//
// Pattern: every copy function takes (lang, ...args) and returns
// `{ title, body }`. Bahasa Indonesia first because that's the primary
// user audience (project_homu.md → Indonesia focus).

import type { Lang } from "@/lib/i18n/dictionaries";

const formatAmount = (amount: number, currency: string): string => {
  // Indonesian rupiah convention: no decimals, dot thousands separator.
  // For other currencies we lean on Intl with a sensible default.
  try {
    return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(currency === "IDR" ? 0 : 2)}`;
  }
};

export type NotificationCopy = { title: string; body: string };

/** "Reminder · Internet bill is due tomorrow (Rp 350.000)." */
export function recurringDueCopy(
  lang: Lang,
  args: {
    itemName: string;
    amount: number;
    currency: string;
    dueDate: string; // ISO yyyy-mm-dd
    today: string; // ISO yyyy-mm-dd (for "today" vs "tomorrow" wording)
  }
): NotificationCopy {
  const amountStr = formatAmount(args.amount, args.currency);
  const isToday = args.dueDate === args.today;

  if (lang === "id") {
    return {
      title: isToday
        ? `Jatuh tempo hari ini: ${args.itemName}`
        : `Jatuh tempo besok: ${args.itemName}`,
      body: isToday
        ? `${args.itemName} jatuh tempo hari ini (${amountStr}). Ketuk untuk catat.`
        : `${args.itemName} jatuh tempo besok (${amountStr}).`,
    };
  }

  return {
    title: isToday
      ? `Due today: ${args.itemName}`
      : `Due tomorrow: ${args.itemName}`,
    body: isToday
      ? `${args.itemName} is due today (${amountStr}). Tap to log it.`
      : `${args.itemName} is due tomorrow (${amountStr}).`,
  };
}

/** "Heads up · Groceries is at 80% of this month's budget." */
export function budgetWarningCopy(
  lang: Lang,
  args: {
    categoryName: string;
    percent: number; // 80 or 100
    spent: number;
    budgetAmount: number;
    currency: string;
  }
): NotificationCopy {
  const spentStr = formatAmount(args.spent, args.currency);
  const budgetStr = formatAmount(args.budgetAmount, args.currency);
  const isOver = args.percent >= 100;

  if (lang === "id") {
    return {
      title: isOver
        ? `Anggaran terlampaui: ${args.categoryName}`
        : `Hampir habis: ${args.categoryName}`,
      body: isOver
        ? `Pengeluaran ${args.categoryName} sudah ${spentStr} dari anggaran ${budgetStr}.`
        : `Sudah ${args.percent}% (${spentStr} dari ${budgetStr}) untuk ${args.categoryName} bulan ini.`,
    };
  }

  return {
    title: isOver
      ? `Budget exceeded: ${args.categoryName}`
      : `Heads up: ${args.categoryName}`,
    body: isOver
      ? `You've spent ${spentStr} on ${args.categoryName} this month — over your ${budgetStr} budget.`
      : `${args.categoryName} is at ${args.percent}% (${spentStr} of ${budgetStr}) this month.`,
  };
}

/** "Don't forget to log today's spending." */
export function dailyNudgeCopy(lang: Lang): NotificationCopy {
  if (lang === "id") {
    return {
      title: "Catat transaksi hari ini?",
      body: "Belum ada catatan hari ini. Ketuk untuk tambah transaksi.",
    };
  }
  return {
    title: "Log today's spending?",
    body: "No transactions logged today. Tap to add one.",
  };
}
