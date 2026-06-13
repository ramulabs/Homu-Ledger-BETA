---
id: health-security-b77f6a7d64
title: deleteCategory deletes by ID only — missing household_id authorization
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:21.290Z
updated_at: 2026-06-13T19:19:21.290Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/categories.ts:111`
**Severity:** critical

## Description

The `deleteCategory` server action deletes a category row using only the category `id`, with no `household_id` guard:

```typescript
export async function deleteCategory(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("categories").delete().eq("id", id);
}
```

Any authenticated user who knows or guesses a valid category UUID can delete any category in any household. This is a data-loss vector if RLS `DELETE` policy on `categories` does not enforce household scope.

## Recommended Fix

Scope the delete to the caller's household:

```typescript
const { data: profile } = await supabase
  .from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .delete()
  .eq("id", id)
  .eq("household_id", profile.household_id);
```
