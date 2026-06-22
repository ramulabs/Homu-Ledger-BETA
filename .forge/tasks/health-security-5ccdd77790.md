---
id: health-security-5ccdd77790
title: updateCategory operates on category ID without verifying household membership
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-22T19:11:52.782Z
updated_at: 2026-06-22T19:11:52.782Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:79`
**Severity:** warning

`updateCategory()` authenticates the user but does not verify the target category belongs to the user's household before updating. The update uses `.eq("id", id)` without a household scope guard. If the Supabase RLS UPDATE policy on `categories` does not enforce household membership, any authenticated user could modify categories belonging to another household.

```typescript
const { error } = await supabase.from("categories").update({ name, symbol, color }).eq("id", id);
// ← no .eq("household_id", profile.household_id)
```

**Fix:** Either add an explicit household scope to the query, or verify ownership first (matching the pattern in `addCategory` which correctly fetches `profile.household_id`).
