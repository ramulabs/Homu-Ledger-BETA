---
id: health-security-baf2a8c2a5
title: deleteCategory deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:04.664Z
updated_at: 2026-08-13T19:18:07.566Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:106`
**Severity:** critical

## Description

`deleteCategory` checks the caller is authenticated, but performs the DELETE filtered only by the row `id` — never by `household_id`:

```typescript
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  ...
```

Same class of issue as `updateCategory` in this file and the already-tracked `cancelInvitation` finding: any authenticated user who supplies a category `id` from another household can delete it if RLS doesn't independently enforce household scoping on DELETE. `app/actions/transactions.ts:deleteTransaction` shows the correct pattern (explicit `.eq("household_id", householdId)`).

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .delete()
  .eq("id", id)
  .eq("household_id", profile.household_id);
```

Also verify the RLS DELETE policy on `categories` scopes by household membership.

Last seen by health check: 2026-08-13T19:18:07.566Z
