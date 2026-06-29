---
id: "health-security-e7815c8db6"
title: "deleteWallet and setDefaultWallet operate on arbitrary wallet ids without household scoping"
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
**File:** `app/actions/wallets.ts:140`  
**Severity:** warning

## Description

Both `deleteWallet` (line 140) and `setDefaultWallet` (line 154) issue DELETE/UPDATE against `wallets` scoped only to the caller-supplied `id` with no `household_id` constraint. `getHouseholdId()` is called in both (lines 126 and 150) but `householdId` is not destructured or included in the WHERE clause. An authenticated user who knows another household's wallet UUID can delete or promote-to-default that wallet if RLS on the wallets table permits it.

## Recommended Fix

In both functions, destructure `householdId` and add `.eq('household_id', householdId)` to the DELETE/UPDATE query:

```typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };
// ...
await supabase.from("wallets").delete().eq("id", id).eq("household_id", householdId);
```

See also related finding `health-security-ff35177012` for `updateWallet`.
