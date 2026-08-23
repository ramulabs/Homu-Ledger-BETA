---
id: health-security-bd9a093261
title: updateRecurringItem updates by ID with no household ownership check
status: completed
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:10.518Z
updated_at: 2026-08-23T19:14:55.016Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:74`
**Severity:** critical

## Description

`updateRecurringItem` checks the caller is authenticated but never resolves or applies a `household_id` scope to the update:

```typescript
export async function updateRecurringItem(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  ...
  const { error } = await supabase
    .from("recurring_items")
    .update({ type, amount, name, category_id, frequency, next_due_date, repeat_until })
    .eq("id", id); // ← no household_id check
```

`addRecurringItem` in the same file correctly scopes inserts to `profile.household_id`, but the update path drops that check entirely. Any authenticated user who supplies another household's `recurring_items` row id can modify it if RLS doesn't independently scope UPDATE by household membership.

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };
...
const { error } = await supabase
  .from("recurring_items")
  .update({ type, amount, name, category_id, frequency, next_due_date, repeat_until })
  .eq("id", id)
  .eq("household_id", profile.household_id);
```

Also verify the RLS UPDATE policy on `recurring_items` scopes by household membership.

## Resolution

Verified via the actual migration SQL (not the app-code path alone): The `recurring_items` UPDATE policy ("recurring: members can update", migration 0001) restricts updates to `household_id = current_household_id()`. `updateRecurringItem`'s app-level `.eq("id", id)` is backed by this row-level check. The app-level query never changed, but the finding is not exploitable — closing as mitigated by database-level authorization rather than application-level authorization. Re-flag if the underlying policy is ever dropped or weakened.

Last seen by health check: 2026-08-13T19:18:07.678Z
