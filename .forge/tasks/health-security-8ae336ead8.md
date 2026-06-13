---
id: health-security-8ae336ead8
title: updateRecurringItem mutates by ID only — missing household_id authorization
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:21.387Z
updated_at: 2026-06-13T19:19:21.387Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/recurring.ts:104`
**Severity:** critical

## Description

The `updateRecurringItem` server action has authentication but updates a `recurring_items` row using only the item `id`, with no `household_id` filter:

```typescript
export async function updateRecurringItem(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // ...
  const { error } = await supabase
    .from("recurring_items")
    .update({ type, amount, name, category_id, frequency, next_due_date, repeat_until })
    .eq("id", id); // ← no household_id filter
}
```

An authenticated user from Household A can overwrite recurring-item fields belonging to Household B if they discover the target item's UUID.

## Recommended Fix

Add a `household_id` filter to the update query using the authenticated caller's profile, mirroring the pattern used in `createRecurringItem` where `household_id` is set on insert.
