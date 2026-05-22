---
id: health-security-5a240a7557
title: updateRecurringItem lacks household ownership check — relies solely on RLS
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-22T19:09:10.957Z
updated_at: 2026-05-22T19:09:10.957Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Ownership Verification
**File:** `app/actions/recurring.ts:93`
**Severity:** warning

`updateRecurringItem` authenticates the user but updates a recurring item by ID alone without verifying household membership. `addRecurringItem` explicitly inserts with `household_id: profile.household_id`, but the update path omits this check:

```typescript
const { error } = await supabase
  .from("recurring_items")
  .update({ type, amount, name, category_id, frequency, ... })
  .eq("id", id);  // no household_id guard
```

**Fix:** Fetch `profile.household_id` and add `.eq("household_id", profile.household_id)` to the update query, matching `addRecurringItem`'s pattern.
