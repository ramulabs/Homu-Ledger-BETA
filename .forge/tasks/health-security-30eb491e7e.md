---
id: health-security-30eb491e7e
title: updateWallet, deleteWallet, setDefaultWallet lack household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:41.387Z
updated_at: 2026-06-24T19:11:41.387Z
---

**File:** `app/actions/wallets.ts:116`

Three wallet mutation functions use the shared `getHouseholdId()` helper but then mutate by UUID only, without filtering on `household_id`. This allows any authenticated user to update, delete, or set-default another household's wallet by UUID.

- `updateWallet` (line 116): `.update(update).eq("id", id)`
- `deleteWallet` (line 140): `.delete().eq("id", id)`
- `setDefaultWallet` (line 154): `.update({ is_default: true }).eq("id", id)`

**Fix:** Add `.eq("household_id", householdId)` to all three operations.
