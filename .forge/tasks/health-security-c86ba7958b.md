---
id: health-security-c86ba7958b
title: updateWallet not scoped to caller's household — cross-household mutation
  possible
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-28T19:15:44.619Z
updated_at: 2026-06-28T19:15:44.619Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:88`
**Severity:** warning

## Description

`updateWallet` (line 88) calls `getHouseholdId()` which returns both `supabase` and `householdId`, but only the `supabase` client is destructured — `householdId` is discarded. The UPDATE is scoped only by `id`, with no `.eq('household_id', householdId)` constraint. An authenticated user who knows or guesses a wallet UUID belonging to another household can rename, re-color, or change its initial_balance, subject only to Supabase RLS policy enforcement.

```typescript
const { supabase } = await getHouseholdId(); // householdId discarded
// ...
const { error } = await supabase.from('wallets').update(update).eq('id', id); // ← no household filter
```

## Recommended Fix

Destructure and use `householdId` as an additional filter:
```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: 'Not authenticated' };
const { error } = await supabase.from('wallets').update(update).eq('id', id).eq('household_id', householdId);
```
