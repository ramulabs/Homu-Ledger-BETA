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

// Backward-compatible aliases (default IDR)
export function formatIDR(amount: number): string { return formatAmount(amount, "IDR"); }
export function formatIDRSigned(amount: number, type: "income" | "expense"): string {
  return formatAmountSigned(amount, type, "IDR");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatShortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const today = new Date();
  if (today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d) {
    return "Today";
  }
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
