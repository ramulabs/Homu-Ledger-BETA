---
id: health-security-7d8fd773e2
title: deleteRecurringItem deletes by ID only — missing household_id authorization
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:34.086Z
updated_at: 2026-06-13T19:19:34.086Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/recurring.ts:117`
**Severity:** critical

## Description

The `deleteRecurringItem` server action deletes a `recurring_items` row using only the item `id`, with no household scope check:

```typescript
export async function deleteRecurringItem(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("recurring_items").delete().eq("id", id);
}
```

Any authenticated user who knows a valid recurring-item UUID can delete it, regardless of which household it belongs to. This is a data-loss IDOR if RLS `DELETE` on `recurring_items` is not household-scoped.

## Recommended Fix

Scope the delete to the caller's household_id, or read the item's household_id first and verify ownership before deleting.
