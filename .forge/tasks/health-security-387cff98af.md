---
id: health-security-387cff98af
title: updateWallet trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.120Z
updated_at: 2026-06-30T19:17:56.120Z
---

## Description

`updateWallet(id, formData)` (`app/actions/wallets.ts:88-123`) fetches the caller's `householdId` via `getHouseholdId()` but never uses it in the update query:

```typescript
const { error } = await supabase.from("wallets").update(update).eq("id", id);
```

`householdId` is fetched purely to confirm authentication; the value is discarded. Inconsistent with `addWallet` in the same file, which correctly inserts with `household_id: householdId`. The only barrier preventing cross-household edits (name, symbol, color, `initial_balance`) is RLS.

**Exploit scenario:** if the `wallets` UPDATE RLS policy is ever regressed, any authenticated user could rewrite another household's wallet name or `initial_balance` by supplying its UUID, corrupting that household's financial reporting.

## Recommended Fix

```typescript
const { error } = await supabase.from("wallets").update(update).eq("id", id).eq("household_id", householdId);
```
