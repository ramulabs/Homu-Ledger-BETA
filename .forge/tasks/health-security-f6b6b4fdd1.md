---
id: health-security-f6b6b4fdd1
title: deleteRecurringItem lacks household ownership check — relies solely on RLS
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-22T19:09:11.048Z
updated_at: 2026-05-22T19:09:11.048Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Ownership Verification
**File:** `app/actions/recurring.ts:117`
**Severity:** warning

`deleteRecurringItem` authenticates the caller but deletes by ID alone without verifying household ownership:

```typescript
const { error } = await supabase.from("recurring_items").delete().eq("id", id);
```

**Fix:** Fetch `profile.household_id` and add `.eq("household_id", profile.household_id)` to the delete query.
