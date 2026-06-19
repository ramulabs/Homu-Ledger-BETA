---
id: health-security-4d29536217
title: updateWallet and setDefaultWallet missing household_id scope in update query
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:19:15.718Z
updated_at: 2026-06-19T19:19:15.718Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Ownership Scope
**File:** `app/actions/wallets.ts:88`
**Severity:** warning

## Description

`updateWallet` (line 88) calls `getHouseholdId()` to resolve the caller's household, but only destructures `supabase` from the result — it discards `householdId` and does not scope the update query to the caller's household:

```typescript
export async function updateWallet(id: string, formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();   // householdId discarded
  if (!supabase) return { error: "Not authenticated" };
  // ...
  const { error } = await supabase.from("wallets").update(update).eq("id", id); // no household_id guard
```

An authenticated user from household A who knows (or guesses) a wallet UUID belonging to household B can rename, re-colour, or change the initial balance of that wallet. The same gap exists in `setDefaultWallet` (line 149). Whether this is exploitable depends entirely on whether the Supabase RLS `UPDATE` policy on `wallets` restricts updates to the owning household.

## Recommended Fix

Add `.eq("household_id", householdId)` to all `wallets` mutating queries:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };
// ...
const { error } = await supabase
  .from("wallets")
  .update(update)
  .eq("id", id)
  .eq("household_id", householdId);  // scopes to caller's household
```

Apply the same fix to `setDefaultWallet`. Also audit the RLS `UPDATE` policy on `wallets`.
