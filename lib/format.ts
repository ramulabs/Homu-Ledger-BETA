import { getCurrency } from "./currencies";

export function formatAmount(amount: number, currencyCode: string = "IDR"): string {
  const cur = getCurrency(currencyCode);
  const rounded = Math.round(Math.abs(amount));
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, cur.separator);
  return cur.spaceBefore ? `${cur.symbol} ${formatted}` : `${cur.symbol}${formatted}`;
}

export function formatAmountSigned(amount: number, type: "income" | "expense", currencyCode: string = "IDR"): string {
  const sign = type === "income" ? "+" : "-";
  return `${sign}${formatAmount(amount, currencyCode)}`;
}

/** Like formatAmount, but preserves the natural sign of the number.
 *  Use this for balances (which can be negative); use formatAmountSigned for
 *  individual transactions where the sign is driven by income/expense type.
 */
export function formatAmountWithSign(amount: number, currencyCode: string = "IDR"): string {
  const formatted = formatAmount(amount, currencyCode);
  return amount < 0 ? `-${formatted}` : formatted;
}

// Backward-compatible aliases (default IDR)
export function formatIDR(amount: number): string { return formatAmount(amount, "IDR"); }
export function formatIDRSigned(amount: number, type: "income" | "expense"): string {
  return formatAmountSigned(amount, type, "IDR");
}

// ── Locale-aware date strings ────────────────────────────────────────
// Two locales supported: "en" and "id". The functions below accept a
// `lang` param and default to "en" for backwards compatibility with
// existing callers (the legacy strings stayed hardcoded English forever).
// Callers in client components should pass useT().lang or the household's
// stored language; server callers should pass profile.language.

type Lang = "en" | "id";

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTHS_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTHS_SHORT_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const DAYS_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const DAYS_FULL_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_FULL_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function todayWord(lang: Lang): string {
  return lang === "id" ? "Hari ini" : "Today";
}

export function getMonthsFull(lang: Lang = "en"): readonly string[] {
  return lang === "id" ? MONTHS_ID : MONTHS_EN;
}
export function getMonthsShort(lang: Lang = "en"): readonly string[] {
  return lang === "id" ? MONTHS_SHORT_ID : MONTHS_SHORT_EN;
}
export function getDaysShort(lang: Lang = "en"): readonly string[] {
  return lang === "id" ? DAYS_SHORT_ID : DAYS_SHORT_EN;
}
export function getDaysFull(lang: Lang = "en"): readonly string[] {
  return lang === "id" ? DAYS_FULL_ID : DAYS_FULL_EN;
}

/**
 * Format "YYYY-MM-DD" as "Mon, 11 May 2026" (EN) / "Sen, 11 Mei 2026" (ID).
 * Used by the daily-trend chart tooltip. Computes the weekday in local
 * time using the parsed components (Date.parse on a bare YYYY-MM-DD
 * interprets it as UTC, which can yield the wrong weekday in
 * negative-UTC-offset timezones).
 */
export function formatDayWithWeekday(date: string, lang: Lang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const local = new Date(y, m - 1, d);
  const daysShort = getDaysShort(lang);
  const monthsShort = getMonthsShort(lang);
  return `${daysShort[local.getDay()]}, ${d} ${monthsShort[m - 1]} ${y}`;
}

/**
 * Group-header label for a YYYY-MM-DD date in the transaction list.
 * Today → "Today"/"Hari ini". Same calendar year → "Mon, 11 May" / "Sen, 11 Mei".
 * Older → adds year. Pass `todayKey` for the SSR-safe "Today" decision.
 */
export function formatDayGroup(date: string, todayKey?: string | null, lang: Lang = "en"): string {
  if (todayKey && todayKey === date) return todayWord(lang);
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const local = new Date(y, m - 1, d);
  const weekday = getDaysShort(lang)[local.getDay()];
  const month = getMonthsShort(lang)[m - 1];
  const currentYear = new Date().getFullYear();
  return y === currentYear
    ? `${weekday}, ${d} ${month}`
    : `${weekday}, ${d} ${month} ${y}`;
}

/**
 * Format a YYYY-MM-DD date as a short label: "11 May 2026" / "11 Mei 2026".
 * Pass `todayKey` (also "YYYY-MM-DD") so the "Today" decision is deterministic
 * across SSR and client (otherwise `new Date()` mismatches between UTC server
 * and the user's local timezone, causing hydration errors).
 */
export function formatShortDate(date: string, todayKey?: string | null, lang: Lang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (todayKey && todayKey === date) return todayWord(lang);
  return `${d} ${getMonthsFull(lang)[m - 1]} ${y}`;
}

/**
 * Long weekday + day + month label, e.g. "Friday 29 May" / "Jumat 29 Mei".
 * Used by the Add Transaction date pill when recurring mode is on.
 */
export function formatWeekdayDate(value: string, lang: Lang = "en"): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const dt = new Date(y, m - 1, d);
  return `${getDaysFull(lang)[dt.getDay()]} ${d} ${getMonthsFull(lang)[m - 1]}`;
}
