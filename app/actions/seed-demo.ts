"use server";

/**
 * seed-demo.ts — Developer-only demo data seeder
 *
 * Seeds a realistic 90-day Indonesian household finance dataset:
 *   • 4 wallets (BCA, Jenius, Cash, Credit Card)
 *   • 14 categories (income + expense)
 *   • ~90 transactions across 3 months
 *   • 6 recurring items
 *   • 5 category budgets
 *
 * Gated on is_developer = true. Idempotent — checks for existing data
 * (≥20 transactions) before inserting to prevent duplication.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Return a date string N days ago (negative N = future). */
function daysOffset(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random integer in [lo, hi] rounded to `step`. */
function rand(lo: number, hi: number, step = 1000): number {
  const raw = lo + Math.random() * (hi - lo);
  return Math.round(raw / step) * step;
}

// ─── seed catalogue ───────────────────────────────────────────────────────────

const SEED_WALLETS = [
  { name: "BCA Tabungan",      symbol: "🏦", color: "#1e40af", initial_balance: 12500000, is_default: true  },
  { name: "Jenius",             symbol: "💳", color: "#7c3aed", initial_balance: 5000000,  is_default: false },
  { name: "Kas Tunai",          symbol: "💵", color: "#15803d", initial_balance: 1500000,  is_default: false },
  { name: "BCA Kartu Kredit",   symbol: "💎", color: "#b91c1c", initial_balance: 0,         is_default: false },
];

const SEED_CATEGORIES = [
  { name: "Gaji",           symbol: "💰", color: "#16a34a", type: "income"  },
  { name: "Freelance",      symbol: "💻", color: "#2563eb", type: "income"  },
  { name: "Belanja Harian", symbol: "🛒", color: "#f97316", type: "expense" },
  { name: "Makan & Minum",  symbol: "🍜", color: "#ea580c", type: "expense" },
  { name: "Transportasi",   symbol: "🚗", color: "#0284c7", type: "expense" },
  { name: "Tagihan",        symbol: "🔌", color: "#7c3aed", type: "expense" },
  { name: "Belanja Online", symbol: "📦", color: "#ec4899", type: "expense" },
  { name: "Hiburan",        symbol: "🎬", color: "#f59e0b", type: "expense" },
  { name: "Kesehatan",      symbol: "💊", color: "#14b8a6", type: "expense" },
  { name: "Pendidikan",     symbol: "📚", color: "#8b5cf6", type: "expense" },
  { name: "Perawatan",      symbol: "✨", color: "#db2777", type: "expense" },
  { name: "Rumah",          symbol: "🏠", color: "#78716c", type: "expense" },
  { name: "Investasi",      symbol: "📈", color: "#059669", type: "expense" },
];

type TxTemplate = {
  name: string;
  catName: string;
  type: "income" | "expense";
  lo: number; hi: number; step: number;
  walletHint: string;
  weight: number;
};

const TX_TEMPLATES: TxTemplate[] = [
  { name: "Indomaret",              catName: "Belanja Harian",  type: "expense", lo: 25000,   hi: 150000,  step: 5000,   walletHint: "Jenius",        weight: 8 },
  { name: "Alfamart",               catName: "Belanja Harian",  type: "expense", lo: 20000,   hi: 100000,  step: 5000,   walletHint: "Jenius",        weight: 7 },
  { name: "SuperIndo",              catName: "Belanja Harian",  type: "expense", lo: 150000,  hi: 500000,  step: 10000,  walletHint: "BCA Tab",       weight: 4 },
  { name: "Pasar Tradisional",      catName: "Belanja Harian",  type: "expense", lo: 80000,   hi: 300000,  step: 10000,  walletHint: "Kas",           weight: 3 },
  { name: "GoFood Order",           catName: "Makan & Minum",   type: "expense", lo: 35000,   hi: 120000,  step: 5000,   walletHint: "Jenius",        weight: 9 },
  { name: "GrabFood Order",         catName: "Makan & Minum",   type: "expense", lo: 35000,   hi: 110000,  step: 5000,   walletHint: "Jenius",        weight: 7 },
  { name: "Makan Siang Kantor",     catName: "Makan & Minum",   type: "expense", lo: 20000,   hi: 60000,   step: 5000,   walletHint: "Kas",           weight: 8 },
  { name: "Kopi Kenangan",          catName: "Makan & Minum",   type: "expense", lo: 25000,   hi: 55000,   step: 5000,   walletHint: "Jenius",        weight: 5 },
  { name: "Starbucks",              catName: "Makan & Minum",   type: "expense", lo: 45000,   hi: 95000,   step: 5000,   walletHint: "BCA Kredit",    weight: 2 },
  { name: "Warung Makan",           catName: "Makan & Minum",   type: "expense", lo: 15000,   hi: 40000,   step: 5000,   walletHint: "Kas",           weight: 6 },
  { name: "GoRide / GoJek",         catName: "Transportasi",    type: "expense", lo: 10000,   hi: 40000,   step: 2000,   walletHint: "Jenius",        weight: 8 },
  { name: "GrabCar",                catName: "Transportasi",    type: "expense", lo: 25000,   hi: 80000,   step: 5000,   walletHint: "BCA Kredit",    weight: 4 },
  { name: "Pertamina BBM",          catName: "Transportasi",    type: "expense", lo: 100000,  hi: 350000,  step: 10000,  walletHint: "Kas",           weight: 2 },
  { name: "Transjakarta",           catName: "Transportasi",    type: "expense", lo: 3500,    hi: 7000,    step: 500,    walletHint: "Jenius",        weight: 5 },
  { name: "Top-Up Telkomsel",       catName: "Tagihan",         type: "expense", lo: 50000,   hi: 150000,  step: 50000,  walletHint: "Jenius",        weight: 2 },
  { name: "Tokopedia",              catName: "Belanja Online",  type: "expense", lo: 50000,   hi: 500000,  step: 10000,  walletHint: "BCA Kredit",    weight: 4 },
  { name: "Shopee",                 catName: "Belanja Online",  type: "expense", lo: 40000,   hi: 350000,  step: 10000,  walletHint: "Jenius",        weight: 5 },
  { name: "Lazada",                 catName: "Belanja Online",  type: "expense", lo: 80000,   hi: 600000,  step: 10000,  walletHint: "BCA Kredit",    weight: 2 },
  { name: "Bioskop XXI",            catName: "Hiburan",         type: "expense", lo: 50000,   hi: 120000,  step: 5000,   walletHint: "BCA Kredit",    weight: 2 },
  { name: "Apotek Kimia Farma",     catName: "Kesehatan",       type: "expense", lo: 30000,   hi: 200000,  step: 5000,   walletHint: "Jenius",        weight: 2 },
  { name: "Konsultasi Dokter",      catName: "Kesehatan",       type: "expense", lo: 100000,  hi: 350000,  step: 25000,  walletHint: "BCA Kredit",    weight: 1 },
  { name: "Buku & Alat Tulis",      catName: "Pendidikan",      type: "expense", lo: 30000,   hi: 150000,  step: 5000,   walletHint: "Jenius",        weight: 1 },
  { name: "Salon / Potong Rambut",  catName: "Perawatan",       type: "expense", lo: 50000,   hi: 200000,  step: 10000,  walletHint: "Kas",           weight: 1 },
  { name: "Guardian / Watson",      catName: "Perawatan",       type: "expense", lo: 80000,   hi: 350000,  step: 10000,  walletHint: "BCA Kredit",    weight: 2 },
  { name: "Bayar Iuran RT",         catName: "Rumah",           type: "expense", lo: 150000,  hi: 150000,  step: 1000,   walletHint: "Kas",           weight: 1 },
  { name: "ACE Hardware",           catName: "Rumah",           type: "expense", lo: 50000,   hi: 500000,  step: 10000,  walletHint: "BCA Kredit",    weight: 1 },
  { name: "Bibit Reksa Dana",       catName: "Investasi",       type: "expense", lo: 500000,  hi: 2000000, step: 100000, walletHint: "BCA Tab",       weight: 1 },
];

// ─── main exported action ─────────────────────────────────────────────────────

export type SeedResult = {
  walletsCreated: number;
  categoriesCreated: number;
  transactionsCreated: number;
  recurringCreated: number;
  budgetsCreated: number;
  alreadySeeded?: boolean;
  error?: string;
};

export async function seedDemoData(): Promise<SeedResult> {
  const empty: SeedResult = { walletsCreated: 0, categoriesCreated: 0, transactionsCreated: 0, recurringCreated: 0, budgetsCreated: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...empty, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id, is_developer")
    .eq("id", user.id)
    .single();

  if (!profile?.is_developer) return { ...empty, error: "Developer access required" };
  const hhId = profile.household_id;
  if (!hhId) return { ...empty, error: "No household found" };

  // Guard: already has ≥20 transactions → already seeded
  const { count: txCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", hhId);
  if ((txCount ?? 0) >= 20) return { ...empty, alreadySeeded: true };

  // ── 1. Wallets ───────────────────────────────────────────────────────
  const { data: existingWallets } = await supabase.from("wallets").select("name").eq("household_id", hhId);
  const existingWalletNames = new Set((existingWallets ?? []).map((w: { name: string }) => w.name));
  const walletsToInsert = SEED_WALLETS.filter(w => !existingWalletNames.has(w.name)).map(w => ({ ...w, household_id: hhId }));
  if (walletsToInsert.length) await supabase.from("wallets").insert(walletsToInsert);
  const walletsCreated = walletsToInsert.length;

  const { data: allWallets } = await supabase.from("wallets").select("id, name").eq("household_id", hhId);
  const walletIdMap: Record<string, string> = {};
  for (const w of allWallets ?? []) walletIdMap[w.name] = w.id;

  function resolveWallet(hint: string): string | null {
    const match = Object.keys(walletIdMap).find(n => n.toLowerCase().includes(hint.toLowerCase()));
    return match ? walletIdMap[match] : (Object.values(walletIdMap)[0] ?? null);
  }

  // ── 2. Categories ────────────────────────────────────────────────────
  const { data: existingCats } = await supabase.from("categories").select("name").eq("household_id", hhId);
  const existingCatNames = new Set((existingCats ?? []).map((c: { name: string }) => c.name));
  const catsToInsert = SEED_CATEGORIES.filter(c => !existingCatNames.has(c.name)).map(c => ({ ...c, household_id: hhId }));
  if (catsToInsert.length) await supabase.from("categories").insert(catsToInsert);
  const categoriesCreated = catsToInsert.length;

  const { data: allCats } = await supabase.from("categories").select("id, name").eq("household_id", hhId);
  const catIdMap: Record<string, string> = {};
  for (const c of allCats ?? []) catIdMap[c.name] = c.id;

  // ── 3. Transactions ──────────────────────────────────────────────────
  const transactions: {
    household_id: string; created_by: string; type: string;
    amount: number; name: string; category_id: string | null;
    wallet_id: string | null; date: string;
  }[] = [];

  // Monthly salary (3 months × day 25)
  for (let m = 3; m >= 1; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    d.setDate(25);
    transactions.push({ household_id: hhId, created_by: user.id, type: "income", amount: rand(9000000, 12000000, 500000), name: "Gaji Bulanan", category_id: catIdMap["Gaji"] ?? null, wallet_id: resolveWallet("BCA Tab"), date: d.toISOString().slice(0, 10) });
  }
  // Freelance income × 2
  transactions.push({ household_id: hhId, created_by: user.id, type: "income", amount: rand(2000000, 4000000, 500000), name: "Proyek Freelance – Desain", category_id: catIdMap["Freelance"] ?? null, wallet_id: resolveWallet("BCA Tab"), date: daysOffset(rand(20, 50, 1)) });
  transactions.push({ household_id: hhId, created_by: user.id, type: "income", amount: rand(1500000, 3000000, 500000), name: "Proyek Freelance – Web", category_id: catIdMap["Freelance"] ?? null, wallet_id: resolveWallet("BCA Tab"), date: daysOffset(rand(60, 85, 1)) });

  // Fixed monthly bills × 3 months
  const fixedBills = [
    { name: "PLN Listrik",        catName: "Tagihan",     amt: 385000,  day: 5,  wallet: "BCA Tab"    },
    { name: "IndiHome Internet",  catName: "Tagihan",     amt: 400000,  day: 7,  wallet: "BCA Tab"    },
    { name: "PDAM Air",           catName: "Tagihan",     amt: 95000,   day: 9,  wallet: "BCA Tab"    },
    { name: "Netflix",            catName: "Hiburan",     amt: 54000,   day: 12, wallet: "BCA Kredit" },
    { name: "Spotify",            catName: "Hiburan",     amt: 29900,   day: 12, wallet: "BCA Kredit" },
    { name: "Les Bahasa Inggris", catName: "Pendidikan",  amt: 500000,  day: 3,  wallet: "BCA Tab"    },
  ];
  for (const bill of fixedBills) {
    for (let m = 3; m >= 1; m--) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      d.setDate(bill.day);
      transactions.push({ household_id: hhId, created_by: user.id, type: "expense", amount: bill.amt, name: bill.name, category_id: catIdMap[bill.catName] ?? null, wallet_id: resolveWallet(bill.wallet), date: d.toISOString().slice(0, 10) });
    }
  }

  // Build weighted pool (exclude items already covered by fixed bills)
  const fixedNames = new Set(fixedBills.map(b => b.name));
  const pool: TxTemplate[] = [];
  for (const t of TX_TEMPLATES) {
    if (!fixedNames.has(t.name)) for (let i = 0; i < t.weight; i++) pool.push(t);
  }

  // ~65 more random daily transactions spread over 90 days
  let attempts = 0;
  while (transactions.length < 95 && attempts < 400) {
    attempts++;
    const daysBack = Math.floor(Math.random() * 88) + 1;
    const dateStr = daysOffset(daysBack);
    const sameDay = transactions.filter(tx => tx.date === dateStr).length;
    if (sameDay >= 3) continue;
    const t = pick(pool);
    transactions.push({ household_id: hhId, created_by: user.id, type: t.type, amount: rand(t.lo, t.hi, t.step), name: t.name, category_id: catIdMap[t.catName] ?? null, wallet_id: resolveWallet(t.walletHint), date: dateStr });
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));
  const { error: txErr } = await supabase.from("transactions").insert(transactions);
  if (txErr) return { ...empty, walletsCreated, categoriesCreated, error: `Transactions: ${txErr.message}` };
  const transactionsCreated = transactions.length;

  // ── 4. Recurring items ───────────────────────────────────────────────
  const now = new Date();
  const nextMonth25 = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > 25 ? 1 : 0), 25).toISOString().slice(0, 10);

  const recurringRows = [
    { type: "income",  amount: 10000000, name: "Gaji Bulanan",      category_id: catIdMap["Gaji"]        ?? null, wallet_id: resolveWallet("BCA Tab"),  frequency: "monthly", next_due_date: nextMonth25 },
    { type: "expense", amount: 400000,   name: "IndiHome Internet",  category_id: catIdMap["Tagihan"]     ?? null, wallet_id: resolveWallet("BCA Tab"),  frequency: "monthly", next_due_date: daysOffset(-7)  },
    { type: "expense", amount: 385000,   name: "PLN Listrik",        category_id: catIdMap["Tagihan"]     ?? null, wallet_id: resolveWallet("BCA Tab"),  frequency: "monthly", next_due_date: daysOffset(-5)  },
    { type: "expense", amount: 95000,    name: "PDAM Air",           category_id: catIdMap["Tagihan"]     ?? null, wallet_id: resolveWallet("BCA Tab"),  frequency: "monthly", next_due_date: daysOffset(-9)  },
    { type: "expense", amount: 54000,    name: "Netflix",            category_id: catIdMap["Hiburan"]     ?? null, wallet_id: resolveWallet("BCA Kredit"), frequency: "monthly", next_due_date: daysOffset(-12) },
    { type: "expense", amount: 500000,   name: "Les Bahasa Inggris", category_id: catIdMap["Pendidikan"]  ?? null, wallet_id: resolveWallet("BCA Tab"),  frequency: "monthly", next_due_date: daysOffset(-3)  },
  ].map(r => ({ ...r, household_id: hhId, created_by: user.id }));

  const { error: recErr } = await supabase.from("recurring_items").insert(recurringRows);
  const recurringCreated = recErr ? 0 : recurringRows.length;

  // ── 5. Budgets (requires RAM-5 migration) ────────────────────────────
  let budgetsCreated = 0;
  try {
    const budgetRows = [
      { category_id: catIdMap["Belanja Harian"], amount: 2000000, currency: "IDR" },
      { category_id: catIdMap["Makan & Minum"],  amount: 1500000, currency: "IDR" },
      { category_id: catIdMap["Transportasi"],   amount: 1000000, currency: "IDR" },
      { category_id: catIdMap["Belanja Online"], amount: 1000000, currency: "IDR" },
      { category_id: catIdMap["Hiburan"],        amount: 500000,  currency: "IDR" },
    ].filter(b => b.category_id).map(b => ({ ...b, household_id: hhId, created_by: user.id }));

    const { error: budgErr } = await supabase.from("budgets").upsert(budgetRows, { onConflict: "household_id,category_id", ignoreDuplicates: true });
    if (!budgErr) budgetsCreated = budgetRows.length;
  } catch { /* budgets table not applied yet — skip gracefully */ }

  revalidatePath("/transactions");
  revalidatePath("/reports");

  return { walletsCreated, categoriesCreated, transactionsCreated, recurringCreated, budgetsCreated };
}
