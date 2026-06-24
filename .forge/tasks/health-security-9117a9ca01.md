---
id: health-security-9117a9ca01
title: updateRecurringItem and deleteRecurringItem lack household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:31.155Z
updated_at: 2026-06-24T19:11:31.155Z
---

**File:** `app/actions/recurring.ts:93`

The `updateRecurringItem` action authenticates the user but then issues `.update(...).eq("id", id)` without asserting that the recurring item belongs to the caller's household. An authenticated user from a different household who knows the UUID of another household's recurring item can modify it. `deleteRecurringItem` (line 112) has the same issue.

```ts
const { error } = await supabase
  .from("recurring_items")
  .update({ ... })
  .eq("id", id);  // missing: .eq("household_id", householdId)
```

**Fix:** Add `.eq("household_id", profile.household_id)` to scope updates/deletes to the authenticated user's household. Note: RLS policies may provide a partial safety net but server-action layer checks are required for defense-in-depth.
