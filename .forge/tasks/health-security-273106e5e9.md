---
id: health-security-273106e5e9
title: updateCategory and deleteCategory lack household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:31.277Z
updated_at: 2026-06-24T19:11:31.277Z
---

**File:** `app/actions/categories.ts:94`

Both `updateCategory` (line 94) and `deleteCategory` (line 110) authenticate the caller but do not scope the mutation to the authenticated user's household. The UPDATE and DELETE use only `.eq("id", id)`, allowing any authenticated user to rename or delete categories belonging to a different household by guessing the category UUID.

```ts
const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id);  // missing: .eq("household_id", profile.household_id)
```

**Fix:** Add `.eq("household_id", profile.household_id)` to both operations.
