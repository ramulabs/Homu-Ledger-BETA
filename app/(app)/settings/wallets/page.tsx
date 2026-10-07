import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import WalletsShell from "@/components/wallets-shell";
import type { DbWallet } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof requireSession>>["supabase"];
const PAGE = 1000;

// Every (wallet_id, type, amount) in the ledger, transfers included (they
// move money between wallets). v1.48.3 — paged: PostgREST caps a response at
// 1,000 rows, so the single unpaged select used here before silently dropped
// rows past the first 1,000 and showed WRONG wallet balances on bigger
// ledgers. Same paging as the MCP list_wallets tool.
async function fetchWalletDeltas(supabase: Supabase, householdId: string) {
  const delta = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("wallet_id, type, amount")
      .eq("household_id", householdId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load wallet balances: ${error.message}`);
    for (const t of data ?? []) {
      if (!t.wallet_id) continue;
      const signed = (t.type === "income" ? 1 : -1) * Number(t.amount);
      delta.set(t.wallet_id, (delta.get(t.wallet_id) ?? 0) + signed);
    }
    if (!data || data.length < PAGE) break;
  }
  return delta;
}

export default async function WalletsPage() {
  const { supabase, profile } = await requireSession();
  if (!profile?.household_id) redirect("/onboarding");

  const [{ data: walletsRaw }, { data: household }, txDeltaByWallet] = await Promise.all([
    supabase
      .from("wallets")
      .select("id, name, symbol, color, initial_balance, is_default")
      .eq("household_id", profile.household_id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("households")
      .select("currency")
      .eq("id", profile.household_id)
      .single(),
    fetchWalletDeltas(supabase, profile.household_id),
  ]);

  const wallets: DbWallet[] = (walletsRaw ?? []).map((w) => ({
    ...w,
    initial_balance: Number(w.initial_balance ?? 0),
  }));

  // Per-wallet balance: initial_balance + sum(income) - sum(expense)
  const walletsWithBalance = wallets.map((w) => ({
    ...w,
    balance: Number(w.initial_balance) + (txDeltaByWallet.get(w.id) ?? 0),
  }));

  return (
    <WalletsShell
      wallets={walletsWithBalance}
      iconStyle={profile.icon_style ?? "2d"}
      currency={household?.currency ?? "IDR"}
    />
  );
}
