---
id: health-security-bfbb9c92c1
title: deleteRecurringItem deletes by ID with no household ownership check
status: completed
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:10.650Z
updated_at: 2026-08-23T19:14:55.122Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:112`
**Severity:** critical

## Description

`deleteRecurringItem` checks the caller is authenticated but deletes filtered only by row `id`:

```typescript
export async function deleteRecurringItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("recurring_items").delete().eq("id", id); // ← no household_id check
```

Same class of issue as `updateRecurringItem` in this file. Any authenticated user who supplies another household's `recurring_items` row id can delete it if RLS doesn't independently scope DELETE by household membership.

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

Also verify the RLS DELETE policy on `recurring_items` scopes by household membership.

## Resolution

Verified via the actual migration SQL (not the app-code path alone): The `recurring_items` DELETE policy ("recurring: members can delete", migration 0001) restricts deletes to `household_id = current_household_id()`. `deleteRecurringItem`'s app-level `.eq("id", id)` is backed by this row-level check. The app-level query never changed, but the finding is not exploitable — closing as mitigated by database-level authorization rather than application-level authorization. Re-flag if the underlying policy is ever dropped or weakened.

Last seen by health check: 2026-08-13T19:18:07.793Z
