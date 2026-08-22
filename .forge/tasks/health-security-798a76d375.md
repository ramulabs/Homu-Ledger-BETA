---
id: health-security-798a76d375
title: deleteWallet deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.404Z
updated_at: 2026-08-22T19:14:33.404Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:125`
**Severity:** critical

## Description

`deleteWallet` resolves the wallet's `is_default` flag and the caller's session via `getHouseholdId()`, but the delete itself is filtered only by `id`:

```typescript
export async function deleteWallet(id: string): Promise<{ error?: string }> {
  const { supabase } = await getHouseholdId();
  if (!supabase) return { error: "Not authenticated" };

  const { data: wallet } = await supabase.from("wallets").select("is_default").eq("id", id).single();
  if (wallet?.is_default) return { error: "Set another wallet as default before deleting this one." };

  const { error } = await supabase.from("wallets").delete().eq("id", id);
```

Neither the lookup nor the delete scopes by `household_id`. An authenticated user who knows or guesses another household's wallet id can delete it (subject to the RLS DELETE policy on `wallets` being the only backstop), diverging from the `transactions.ts` reference pattern.

## Recommended Fix

Thread `householdId` through both the lookup and the delete:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };

const { data: wallet } = await supabase
  .from("wallets").select("is_default").eq("id", id).eq("household_id", householdId).single();
if (wallet?.is_default) return { error: "Set another wallet as default before deleting this one." };

const { error } = await supabase
  .from("wallets").delete().eq("id", id).eq("household_id", householdId);
```
