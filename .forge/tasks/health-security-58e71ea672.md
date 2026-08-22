---
id: health-security-58e71ea672
title: setDefaultWallet discards household scope, updates by ID alone
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.521Z
updated_at: 2026-08-22T19:14:33.521Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:149`
**Severity:** critical

## Description

`setDefaultWallet` has the same gap as `updateWallet` in this file:

```typescript
export async function setDefaultWallet(id: string): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();
  if (!supabase) return { error: "Not authenticated" };

  const { error } = await supabase.from("wallets").update({ is_default: true }).eq("id", id);
```

An authenticated user can flip `is_default = true` on a wallet belonging to another household by id alone, again relying only on RLS. Because the DB trigger that flips the previous default off is presumably scoped to the target wallet's own household, this could also let one user's action perturb another household's wallet-default state, without any application-level tenant check.

## Recommended Fix

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };

const { error } = await supabase
  .from("wallets")
  .update({ is_default: true })
  .eq("id", id)
  .eq("household_id", householdId);
```
