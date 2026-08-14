---
id: health-security-08715ec33a
title: updateWallet discards household scope, updates by ID alone
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:04.795Z
updated_at: 2026-08-14T19:16:49.278Z
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

Last seen by health check: 2026-08-14T19:16:49.278Z
