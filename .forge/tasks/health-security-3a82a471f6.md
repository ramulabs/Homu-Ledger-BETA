---
id: health-security-3a82a471f6
title: deleteCategory operates on category ID without verifying household membership
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-22T19:11:52.875Z
updated_at: 2026-06-22T19:11:52.875Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:106`
**Severity:** warning

`deleteCategory()` authenticates the user but does not verify the target category belongs to the user's household before deleting. The delete uses `.eq("id", id)` without a household scope guard. If RLS DELETE policy on `categories` does not enforce household membership, any authenticated user could delete categories from another household.

```typescript
const { error } = await supabase.from("categories").delete().eq("id", id);
// ← no .eq("household_id", profile.household_id)
```

**Fix:** Fetch the user's `household_id` (as `addCategory` does) and add it as a filter: `.eq("household_id", profile.household_id)`. This ensures the delete only affects categories owned by the caller's household regardless of RLS policy.
