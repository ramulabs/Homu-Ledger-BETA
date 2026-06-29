---
id: "health-security-ff35177012"
title: "updateWallet updates by id only with no household_id constraint"
status: "backlog"
priority: "P2"
labels:
  - "security"
  - "warning"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/actions/wallets.ts:116`  
**Severity:** warning

## Description

The `updateWallet` action (lines 88–123) calls `getHouseholdId()` to retrieve the caller's `householdId` but then destructures only `supabase` from the result and never uses `householdId` in the UPDATE query (line 116):

```typescript
const { supabase } = await getHouseholdId(); // householdId is discarded
// ...
const { error } = await supabase.from("wallets").update(update).eq("id", id); // no .eq("household_id", ...)
```

An authenticated user can supply any wallet UUID — including one belonging to a different household — and modify its name, symbol, color, or initial balance, provided RLS does not block it.

## Recommended Fix

Destructure `householdId` and add it to the WHERE clause:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };
// ...
const { error } = await supabase.from("wallets").update(update).eq("id", id).eq("household_id", householdId);
```

Apply the same fix to `deleteWallet` (line 140) and `setDefaultWallet` (line 154) — see also `health-security-e7815c8db6`.
