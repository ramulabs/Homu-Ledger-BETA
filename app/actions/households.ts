"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, validateAmount, validateCurrency, validateName, validateSymbol } from "@/lib/validation";

export async function switchHousehold(householdId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("switch_household", { p_household_id: householdId });
  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/settings");
  return {};
}

export async function updateHouseholdCurrency(currency: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };

  const currencyErr = validateCurrency(currency);
  if (currencyErr) return { error: currencyErr };

  const { error } = await supabase
    .from("households")
    .update({ currency: currency.trim() })
    .eq("id", profile.household_id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/reports");
  return {};
}

export async function updateHouseholdName(name: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trimmed = name.trim();
  const nameErr = validateName(trimmed, LIMITS.HOUSEHOLD_NAME);
  if (nameErr) return { error: nameErr };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };

  const { error } = await supabase
    .from("households")
    .update({ name: trimmed })
    .eq("id", profile.household_id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/reports");
  return {};
}

export async function updateHouseholdSymbol(symbol: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (!profile?.household_id) return { error: "No household" };

  const symbolErr = validateSymbol(symbol);
  if (symbolErr) return { error: symbolErr };

  const { error } = await supabase
    .from("households")
    .update({ symbol })
    .eq("id", profile.household_id);

  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/transactions");
  return {};
}

export async function createNewLedger(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const name = (formData.get("name") as string).trim();
  const currency = (formData.get("currency") as string) || "IDR";
  const openingBalanceRaw = (formData.get("opening_balance") as string) || "0";
  const openingBalance = parseFloat(openingBalanceRaw.replace(/\./g, "").replace(",", ".")) || 0;

  const nameErr = validateName(name, LIMITS.HOUSEHOLD_NAME);
  if (nameErr) return { error: nameErr };
  const currencyErr = validateCurrency(currency);
  if (currencyErr) return { error: currencyErr };
  const balanceErr = validateAmount(openingBalance, { allowZero: true });
  if (balanceErr) return { error: balanceErr };

  const { data: codeData, error: codeError } = await supabase.rpc("generate_invite_code");
  if (codeError) return { error: codeError.message };

  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({ name, invite_code: codeData, opening_balance: openingBalance, owner_id: user.id, currency })
    .select("id")
    .single();

  if (householdError || !household) return { error: householdError?.message ?? "Failed to create" };

  // Insert into membership table
  await supabase
    .from("household_members")
    .insert({ household_id: household.id, profile_id: user.id, role: "owner" });

  // Switch to this new ledger
  await supabase
    .from("profiles")
    .update({ household_id: household.id })
    .eq("id", user.id);

  revalidatePath("/transactions");
  revalidatePath("/reports");
  revalidatePath("/settings");
  return {};
}
