---
id: health-security-75891ef954
title: deleteCategory lacks household ownership check — relies solely on RLS
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-22T19:09:02.043Z
updated_at: 2026-05-22T19:09:02.043Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Ownership Verification
**File:** `app/actions/categories.ts:111`
**Severity:** warning

`deleteCategory` authenticates the caller but deletes by ID alone without a household ownership check:

```typescript
const { error } = await supabase.from("categories").delete().eq("id", id);
```

If RLS gaps exist, an attacker can delete categories from other households.

**Fix:** Fetch `profile.household_id` and add `.eq("household_id", profile.household_id)` to the delete query.
