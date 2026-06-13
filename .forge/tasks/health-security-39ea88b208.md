---
id: health-security-39ea88b208
title: updateWallet mutates by ID only — householdId fetched but not used in filter
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:34.193Z
updated_at: 2026-06-13T19:19:34.193Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/wallets.ts:116`
**Severity:** critical

## Description

`updateWallet` calls `getHouseholdId()` for authentication but does not use the returned `householdId` to scope the update:

```typescript
export async function updateWallet(id: string, formData: FormData) {
  const { supabase } = await getHouseholdId(); // householdId discarded
  if (!supabase) return { error: "Not authenticated" };
  // ...
  const { error } = await supabase.from("wallets").update(update).eq("id", id);
  //                                                                   ↑ no household_id
}
```

The authenticated session's row-level context is the only guard. If the `wallets` RLS `UPDATE` policy does not enforce `household_id = <caller's household>`, any authenticated user can rename or reconfigure any wallet by UUID.

## Recommended Fix

Destructure and use `householdId` in the filter:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };
// ...
const { error } = await supabase.from("wallets")
  .update(update)
  .eq("id", id)
  .eq("household_id", householdId);
```
