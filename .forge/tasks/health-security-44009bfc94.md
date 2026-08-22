---
id: health-security-44009bfc94
title: deleteCategory deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.161Z
updated_at: 2026-08-22T19:14:33.161Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:106`
**Severity:** critical

## Description

`deleteCategory` authenticates the caller but deletes solely by row `id`, with no `household_id` filter:

```typescript
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("categories").delete().eq("id", id);
```

This mirrors the `updateCategory` gap in the same file and departs from the pattern in `app/actions/transactions.ts`. The only thing preventing cross-household deletion is the `categories: members can delete` RLS policy — the server action itself provides no application-level scoping.

## Recommended Fix

Resolve `household_id` from the caller's profile and add it to the filter, matching `addCategory`'s pattern:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .delete()
  .eq("id", id)
  .eq("household_id", profile.household_id);
```
