---
id: health-security-44b86dac35
title: updateWallet discards household scope, updates by ID alone
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.288Z
updated_at: 2026-08-22T19:14:33.288Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:88`
**Severity:** critical

## Description

`updateWallet` calls the file's own `getHouseholdId()` helper (which already resolves the caller's `householdId`) but then discards it, only destructuring `supabase` before the UPDATE:

```typescript
export async function updateWallet(id: string, formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId(); // householdId thrown away
  if (!supabase) return { error: "Not authenticated" };
  ...
  const { error } = await supabase.from("wallets").update(update).eq("id", id);
```

Unlike `app/actions/transactions.ts:updateTransaction`, which chains `.eq("household_id", householdId)`, this update is filtered only by `id`. Any authenticated user supplying another household's wallet id can rename it, recolor it, or change its `initial_balance` — the RLS UPDATE policy on `wallets` is the sole remaining check.

## Recommended Fix

Use the `householdId` that `getHouseholdId()` already returns:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };
...
const { error } = await supabase
  .from("wallets")
  .update(update)
  .eq("id", id)
  .eq("household_id", householdId);
```
