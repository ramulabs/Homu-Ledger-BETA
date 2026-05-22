---
id: health-security-6ba170cf98
title: updateCategory lacks household ownership check — relies solely on RLS
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-22T19:09:01.949Z
updated_at: 2026-05-22T19:09:01.949Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Ownership Verification
**File:** `app/actions/categories.ts:94`
**Severity:** warning

`updateCategory` verifies the user is authenticated but updates any category by ID without checking the category belongs to the user's household. `addCategory` correctly guards with `eq("household_id", profile.household_id)`, but the update path does not:

```typescript
const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id);  // no household_id check
```

If RLS is misconfigured or a policy gap exists, a user could modify categories in a household they don't belong to.

**Fix:** Fetch the user's `profile.household_id` and add `.eq("household_id", profile.household_id)` to the update query, matching the defensive pattern used in `addCategory`.
