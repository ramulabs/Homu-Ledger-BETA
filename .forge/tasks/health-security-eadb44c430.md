---
id: health-security-eadb44c430
title: updateCategory updates by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.041Z
updated_at: 2026-08-22T19:14:33.041Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:79`
**Severity:** critical

## Description

`updateCategory` checks that the caller is authenticated but performs the UPDATE filtered only by the row `id` — it never scopes to the caller's `household_id`:

```typescript
export async function updateCategory(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  ...
  const { error } = await supabase
    .from("categories")
    .update({ name, symbol, color })
    .eq("id", id); // no household_id check
```

Contrast with `app/actions/transactions.ts:updateTransaction`, which resolves the caller's `householdId` and chains `.eq("household_id", householdId)` as defense-in-depth alongside RLS. Here, any authenticated user who supplies a category `id` belonging to a different household can rename/recolor it, relying entirely on the `categories: members can update` RLS policy as the only backstop.

## Recommended Fix

Resolve the caller's `household_id` (as `addCategory` already does in this same file) and scope the update to it:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id)
  .eq("household_id", profile.household_id);
```
