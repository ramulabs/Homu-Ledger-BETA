---
id: health-security-2ed96ec81e
title: setDefaultWallet discards household scope, updates by ID alone
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:10.377Z
updated_at: 2026-08-17T19:14:19.454Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:149`
**Severity:** critical

## Description

`setDefaultWallet` discards the `householdId` resolved by `getHouseholdId()` and updates by row `id` alone:

```typescript
export async function setDefaultWallet(id: string): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();
  if (!supabase) return { error: "Not authenticated" };

  // The DB trigger flips the previous default to false automatically.
  const { error } = await supabase.from("wallets").update({ is_default: true }).eq("id", id);
```

The comment about "the DB trigger flips the previous default" implies this trigger operates within a household scope — but the action itself can target ANY wallet id if RLS doesn't independently restrict it. An authenticated user could potentially set a wallet in another household as that household's default, which (depending on the trigger's scoping logic) could corrupt another household's wallet state.

## Recommended Fix

```typescript
export async function setDefaultWallet(id: string): Promise<{ error?: string }> {
  const { supabase, householdId } = await getHouseholdId();
  if (!supabase || !householdId) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("wallets")
    .update({ is_default: true })
    .eq("id", id)
    .eq("household_id", householdId);
```

Also verify the RLS UPDATE policy on `wallets` scopes by household membership.

Last seen by health check: 2026-08-17T19:14:19.454Z
