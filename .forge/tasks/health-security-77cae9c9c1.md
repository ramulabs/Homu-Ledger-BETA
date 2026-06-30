---
id: health-security-77cae9c9c1
title: setDefaultWallet trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.327Z
updated_at: 2026-06-30T19:17:56.327Z
---

## Description

`setDefaultWallet(id)` (`app/actions/wallets.ts:149-161`) sets `is_default = true` on a wallet purely by id, with `householdId` fetched but unused:

```typescript
const { error } = await supabase.from("wallets").update({ is_default: true }).eq("id", id);
```

The `ensure_single_default_wallet` DB trigger operates within the household of the row being updated. If RLS were ever bypassed, a cross-household call here would flip the default-wallet flag on another household's wallets via the trigger's side effect.

**Exploit scenario:** if the `wallets` UPDATE RLS policy is ever regressed, a user could pass another household's wallet id and flip its default-wallet flag, altering which wallet that household's transactions default to.

## Recommended Fix

```typescript
const { error } = await supabase.from("wallets").update({ is_default: true }).eq("id", id).eq("household_id", householdId);
```
