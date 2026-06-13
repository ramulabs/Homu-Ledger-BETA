---
id: health-security-149c135330
title: setDefaultWallet updates by ID only — missing household_id authorization
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:50.171Z
updated_at: 2026-06-13T19:19:50.171Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/wallets.ts:154`
**Severity:** critical

## Description

`setDefaultWallet` updates the `is_default` flag on a wallet row using only the wallet `id`:

```typescript
export async function setDefaultWallet(id: string) {
  const { supabase } = await getHouseholdId(); // householdId discarded
  if (!supabase) return { error: "Not authenticated" };

  const { error } = await supabase.from("wallets")
    .update({ is_default: true })
    .eq("id", id); // ← no household_id filter
}
```

An authenticated user from Household A can set a wallet in Household B as that household's default (via the DB trigger that flips the previous default). This could disrupt another household's financial tracking defaults.

## Recommended Fix

Use the `householdId` returned by `getHouseholdId()` as a second filter:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };

const { error } = await supabase.from("wallets")
  .update({ is_default: true })
  .eq("id", id)
  .eq("household_id", householdId);
```
