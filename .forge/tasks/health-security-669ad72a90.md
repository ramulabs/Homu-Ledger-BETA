---
id: health-security-669ad72a90
title: updateCategory updates by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:04.532Z
updated_at: 2026-08-20T19:14:15.730Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/categories.ts:79`
**Severity:** critical

## Description

`updateCategory` checks the caller is authenticated, but performs the UPDATE filtered only by the row `id` — never by `household_id`:

```typescript
export async function updateCategory(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  ...
  const { error } = await supabase
    .from("categories")
    .update({ name, symbol, color })
    .eq("id", id); // ← no household_id check
```

Contrast with `app/actions/transactions.ts:updateTransaction`, which explicitly chains `.eq("household_id", householdId)` as defense in depth on top of RLS. Any authenticated user who supplies a category `id` belonging to a different household can rename/recolor it if the RLS UPDATE policy on `categories` doesn't independently scope by household membership — the server action provides no additional check either way.

## Recommended Fix

Resolve the caller's `household_id` (as the file already does in `addCategory`) and scope the update to it:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id)
  .eq("household_id", profile.household_id);
```

Confirm the RLS UPDATE policy on `categories` also enforces household membership as a second line of defense.

Last seen by health check: 2026-08-20T19:14:15.730Z
