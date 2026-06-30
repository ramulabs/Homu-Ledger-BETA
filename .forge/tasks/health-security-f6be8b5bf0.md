---
id: health-security-f6be8b5bf0
title: deleteWallet trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.221Z
updated_at: 2026-06-30T19:17:56.221Z
---

## Description

`deleteWallet(id)` (`app/actions/wallets.ts:125-147`) checks `is_default` on the target wallet but never confirms the wallet belongs to the caller's `householdId`, which is already in scope from `getHouseholdId()`:

```typescript
const { data: wallet } = await supabase.from("wallets").select("is_default").eq("id", id).single();
if (wallet?.is_default) return { error: "Set another wallet as default before deleting this one." };
const { error } = await supabase.from("wallets").delete().eq("id", id);
```

Neither the read nor the delete filters on `household_id`. A code comment even says "Default wallet is also blocked by RLS" — acknowledging RLS as the real backstop — but the destructive delete itself has no explicit ownership check.

**Exploit scenario:** if the `wallets` DELETE RLS policy is ever regressed, any authenticated user could delete another household's non-default wallet by id, corrupting transaction-to-wallet associations.

## Recommended Fix

```typescript
const { data: wallet } = await supabase.from("wallets").select("is_default").eq("id", id).eq("household_id", householdId).single();
if (!wallet) return { error: "Wallet not found" };
if (wallet.is_default) return { error: "Set another wallet as default before deleting this one." };
const { error } = await supabase.from("wallets").delete().eq("id", id).eq("household_id", householdId);
```
