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

export type DateLang = "en" | "id";

const MONTHS: Record<DateLang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
};

const MONTHS_SHORT: Record<DateLang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
};

const DAYS_SHORT: Record<DateLang, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
};

const DAYS_LONG: Record<DateLang, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
};

const TODAY: Record<DateLang, string> = { en: "Today", id: "Hari ini" };

// All app dates are day-first ("13 Oct", "Mon, 13 Oct 2026") in both
// languages (v1.49.0 — Reports used US month-first ranges, and every label
// was English even in Bahasa Indonesia).

/** "Mon, 11 May 2026" / "Sen, 11 Mei 2026". Computes the weekday from the
 *  parsed parts (Date.parse on a bare YYYY-MM-DD is UTC). */
export function formatDayWithWeekday(date: string, lang: DateLang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const local = new Date(y, m - 1, d);
  return `${DAYS_SHORT[lang][local.getDay()]}, ${d} ${MONTHS_SHORT[lang][m - 1]} ${y}`;
}

/** "Sunday 5 October" / "Minggu 5 Oktober" — weekday + day + full month. */
export function formatWeekdayLong(date: string, lang: DateLang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${DAYS_LONG[lang][new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[lang][m - 1]}`;
}

/** "Sat 30 Aug" / "Sab 30 Agu" — compact chip date. */
export function formatChipDate(date: string, lang: DateLang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${DAYS_SHORT[lang][new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS_SHORT[lang][m - 1]}`;
}

/**
 * Group-header label for a YYYY-MM-DD date in the transaction list.
 * Today → "Today". Same calendar year → "Mon, 11 May". Older → "Mon, 11 May 2025".
 * Pass `todayKey` for the SSR-safe "Today" decision (see formatShortDate).
 */
export function formatDayGroup(date: string, todayKey?: string | null, lang: DateLang = "en"): string {
  if (todayKey && todayKey === date) return TODAY[lang];
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const local = new Date(y, m - 1, d);
  const weekday = DAYS_SHORT[lang][local.getDay()];
  const month = MONTHS_SHORT[lang][m - 1];
  const currentYear = new Date().getFullYear();
  return y === currentYear
    ? `${weekday}, ${d} ${month}`
    : `${weekday}, ${d} ${month} ${y}`;
}

/**
 * Format a YYYY-MM-DD date as "5 October 2026" / "5 Oktober 2026".
 * Pass `todayKey` (also "YYYY-MM-DD") so the "Today" decision is deterministic
 * across SSR and client (otherwise `new Date()` mismatches between UTC server
 * and the user's local timezone, causing hydration errors).
 * If `todayKey` is null/undefined the function never returns "Today".
 */
export function formatShortDate(date: string, todayKey?: string | null, lang: DateLang = "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  if (todayKey && todayKey === date) return TODAY[lang];
  if (!y || !m || !d) return date;
  return `${d} ${MONTHS[lang][m - 1]} ${y}`;
}

/** A Date (or ISO timestamp) as "5 Oct 2026" / "5 Okt 2026" in local time.
 *  For created_at-style timestamps — never toLocaleDateString(), whose
 *  device-locale output ("10/12/2026") reads as a different day in ID. */
export function formatTimestampDate(value: string | Date, lang: DateLang = "en"): string {
  const dt = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getDate()} ${MONTHS_SHORT[lang][dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "15 Sep – 14 Oct" / "15 Sep – 14 Okt". */
export function formatDateRange(start: Date, end: Date, lang: DateLang = "en"): string {
  const s = `${start.getDate()} ${MONTHS_SHORT[lang][start.getMonth()]}`;
  const e = `${end.getDate()} ${MONTHS_SHORT[lang][end.getMonth()]}`;
  return `${s} – ${e}`;
}

/**
 * Today's date as YYYY-MM-DD in the DEVICE's timezone. Use this for any
 * "today" a user sees or saves — `new Date().toISOString()` is UTC, which in
 * Indonesia (UTC+7..+9) is still yesterday until 07:00–09:00 local time.
 */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
