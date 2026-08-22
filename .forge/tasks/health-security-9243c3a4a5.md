---
id: health-security-9243c3a4a5
title: deleteRecurringItem deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.751Z
updated_at: 2026-08-22T19:14:33.751Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:112`
**Severity:** critical

## Description

`deleteRecurringItem` has the same gap as `updateRecurringItem` in this file:

```typescript
export async function deleteRecurringItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("recurring_items").delete().eq("id", id);
```

No `household_id` scoping is applied before the delete, so any authenticated user supplying a foreign recurring-item id can delete it, with only the RLS DELETE policy as a backstop.

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("recurring_items")
  .delete()
  .eq("id", id)
  .eq("household_id", profile.household_id);
```
