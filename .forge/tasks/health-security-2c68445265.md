---
id: health-security-2c68445265
title: deleteWallet deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:10.250Z
updated_at: 2026-08-28T19:12:24.752Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:125`
**Severity:** critical

## Description

`deleteWallet` looks up `is_default` for the target wallet and deletes it, but neither the lookup nor the delete is scoped to the caller's household:

```typescript
export async function deleteWallet(id: string): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();
  if (!supabase) return { error: "Not authenticated" };

  const { data: wallet } = await supabase.from("wallets").select("is_default").eq("id", id).single();
  if (wallet?.is_default) return { error: "Set another wallet as default before deleting this one." };

  const { error } = await supabase.from("wallets").delete().eq("id", id); // ← no household_id check
```

Any authenticated user who supplies another household's wallet `id` can delete it (as long as it isn't that household's default wallet) if RLS doesn't independently scope DELETE by household membership. `app/actions/transactions.ts:deleteTransaction` shows the correct pattern.

## Recommended Fix

```typescript
export async function deleteWallet(id: string): Promise<{ error?: string }> {
  const { supabase, householdId } = await getHouseholdId();
  if (!supabase || !householdId) return { error: "Not authenticated" };

  const { data: wallet } = await supabase
    .from("wallets").select("is_default").eq("id", id).eq("household_id", householdId).single();
  if (!wallet) return { error: "Wallet not found." };
  if (wallet.is_default) return { error: "Set another wallet as default before deleting this one." };

  const { error } = await supabase.from("wallets").delete().eq("id", id).eq("household_id", householdId);
```

Also verify the RLS DELETE policy on `wallets` scopes by household membership.

Last seen by health check: 2026-08-28T19:12:24.752Z


## Deep health check follow-up (2026-08-28)

Re-verified this run. The app-code gap described above is real, but Postgres RLS appears to fully cover it: `wallets: members can delete non-default` (migration 0008) — `USING (household_id = current_household_id() AND is_default = false)`.

This looks like it may have been flagged without checking RLS. Recommend a human confirms the policy is still in force (no later migration weakens it) and, if so, downgrades or closes this task — the automated check cannot itself verify RLS coverage, so it is left open pending that confirmation rather than auto-closed.
