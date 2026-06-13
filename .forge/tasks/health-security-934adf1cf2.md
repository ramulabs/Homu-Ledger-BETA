---
id: health-security-934adf1cf2
title: updateCategory mutates by ID only — missing household_id authorization
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:08.777Z
updated_at: 2026-06-13T19:19:08.777Z
---

**Source:** Security · OWASP A01 (Broken Access Control / IDOR)
**File:** `app/actions/categories.ts:97`
**Severity:** critical

## Description

The `updateCategory` server action updates a category row using only the category `id`, with no `household_id` filter:

```typescript
export async function updateCategory(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // ...
  const { error } = await supabase
    .from("categories")
    .update({ name, symbol, color })
    .eq("id", id); // ← no household_id filter
}
```

An authenticated user from Household A can modify categories belonging to Household B if they discover the target category's UUID. Whether this is exploitable depends on the RLS `UPDATE` policy on the `categories` table — if that policy does not enforce household scope, the IDOR is directly exploitable.

## Recommended Fix

Add `household_id` to the update filter after resolving it from the caller's profile:

```typescript
const { data: profile } = await supabase
  .from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id)
  .eq("household_id", profile.household_id);
```

Also audit the RLS `UPDATE` policy on `categories` to enforce household scope at the database level.
