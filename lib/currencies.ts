export const CURRENCIES = [
  { code: "IDR", symbol: "Rp",  name: "Indonesian Rupiah",  separator: ".", spaceBefore: true  },
  { code: "USD", symbol: "$",   name: "US Dollar",          separator: ",", spaceBefore: false },
  { code: "EUR", symbol: "€",   name: "Euro",               separator: ".", spaceBefore: false },
  { code: "GBP", symbol: "£",   name: "British Pound",      separator: ",", spaceBefore: false },
  { code: "JPY", symbol: "¥",   name: "Japanese Yen",       separator: ",", spaceBefore: false },
  { code: "SGD", symbol: "S$",  name: "Singapore Dollar",   separator: ",", spaceBefore: false },
  { code: "MYR", symbol: "RM",  name: "Malaysian Ringgit",  separator: ",", spaceBefore: true  },
  { code: "AUD", symbol: "A$",  name: "Australian Dollar",  separator: ",", spaceBefore: false },
  { code: "CNY", symbol: "¥",   name: "Chinese Yuan",       separator: ",", spaceBefore: false },
  { code: "KRW", symbol: "₩",   name: "South Korean Won",   separator: ",", spaceBefore: false },
  { code: "THB", symbol: "฿",   name: "Thai Baht",          separator: ",", spaceBefore: false },
  { code: "PHP", symbol: "₱",   name: "Philippine Peso",    separator: ",", spaceBefore: false },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function getCurrency(code: string) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}
