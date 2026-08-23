---
id: health-security-08715ec33a
title: updateWallet discards household scope, updates by ID alone
status: completed
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:04.795Z
updated_at: 2026-08-23T19:14:54.670Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:88`
**Severity:** critical

## Description

`updateWallet` resolves the caller's household via `getHouseholdId()` but never uses that `householdId` to scope the actual update — it filters only by the wallet `id`:

```typescript
export async function updateWallet(id: string, formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();
  if (!supabase) return { error: "Not authenticated" };
  ...
  const { error } = await supabase.from("wallets").update(update).eq("id", id); // ← no household_id check
```

Note `getHouseholdId()` even discards `householdId` here (only `supabase` is destructured), so the household lookup happens but its result is never applied. Any authenticated user who supplies another household's wallet `id` can rename it / change its color / change its `initial_balance` if RLS doesn't independently scope UPDATE by household. `app/actions/transactions.ts:updateTransaction` shows the correct pattern.

## Recommended Fix

```typescript
export async function updateWallet(id: string, formData: FormData): Promise<{ error?: string }> {
  const { supabase, householdId } = await getHouseholdId();
  if (!supabase || !householdId) return { error: "Not authenticated" };
  ...
  const { error } = await supabase
    .from("wallets")
    .update(update)
    .eq("id", id)
    .eq("household_id", householdId);
```

Also verify the RLS UPDATE policy on `wallets` scopes by household membership.

## Resolution

Verified via the actual migration SQL (not the app-code path alone): The `wallets` UPDATE policy ("wallets: members can update", migration 0008) restricts updates to `household_id = current_household_id()`. `updateWallet`'s app-level `.eq("id", id)` is backed by this row-level check. The app-level query never changed, but the finding is not exploitable — closing as mitigated by database-level authorization rather than application-level authorization. Re-flag if the underlying policy is ever dropped or weakened.

Last seen by health check: 2026-08-13T19:18:06.505Z
