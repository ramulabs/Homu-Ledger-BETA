---
id: health-security-bfbb9c92c1
title: deleteRecurringItem deletes by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:15:10.650Z
updated_at: 2026-08-28T19:12:25.712Z
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

Last seen by health check: 2026-08-28T19:12:25.712Z


## Deep health check follow-up (2026-08-28)

Re-verified this run. The app-code gap described above is real, but Postgres RLS appears to fully cover it: `recurring: members can delete` (migration 0001) — `USING (household_id = current_household_id())`.

This looks like it may have been flagged without checking RLS. Recommend a human confirms the policy is still in force (no later migration weakens it) and, if so, downgrades or closes this task — the automated check cannot itself verify RLS coverage, so it is left open pending that confirmation rather than auto-closed.
