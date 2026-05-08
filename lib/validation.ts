// Lightweight input validators for server actions. The DB also has CHECK
// constraints (and Supabase enforces RLS), but doing it here gives clean
// user-facing error messages and saves a round-trip.

export const LIMITS = {
  TX_NAME: 200,
  CATEGORY_NAME: 60,
  WALLET_NAME: 40,
  HOUSEHOLD_NAME: 60,
  CURRENCY_CODE: 4, // ISO 4217 is 3 chars; allow one for symbols like "Rp"
  EMOJI_SYMBOL: 8,  // emoji are multi-byte; 8 chars covers most flag/skin-tone
  AMOUNT_MAX: 1e12, // 1 trillion in any currency — well past any household
};

export function validateAmount(amount: number, opts: { allowZero?: boolean } = {}): string | null {
  if (!Number.isFinite(amount)) return "Amount is not a valid number";
  if (amount < 0) return "Amount cannot be negative";
  if (!opts.allowZero && amount <= 0) return "Amount must be greater than 0";
  if (amount > LIMITS.AMOUNT_MAX) return "Amount is too large";
  return null;
}

export function validateName(name: string, max: number, label = "Name"): string | null {
  if (!name) return `${label} is required`;
  if (name.length > max) return `${label} is too long (max ${max} characters)`;
  return null;
}

export function validateType(value: unknown): value is "income" | "expense" {
  return value === "income" || value === "expense";
}

export function validateDate(s: string | null | undefined): string | null {
  if (!s) return "Date is required";
  // YYYY-MM-DD with valid parse
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Date must be YYYY-MM-DD";
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "Invalid date";
  return null;
}

export function validateCurrency(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return "Currency required";
  if (trimmed.length > LIMITS.CURRENCY_CODE) return "Currency code too long";
  return null;
}

export function validateSymbol(s: string): string | null {
  if (!s) return null; // optional
  if (s.length > LIMITS.EMOJI_SYMBOL) return "Symbol too long";
  return null;
}
