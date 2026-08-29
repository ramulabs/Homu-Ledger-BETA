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
updated_at: 2026-08-29T19:16:11.195Z
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

Last seen by health check: 2026-08-13T19:18:07.678Z



---

**Closed by 2026-08-29 health check:** re-verified against this repo's RLS policies (`supabase/migrations/`) — the app-code layer always uses the anon-key + user-cookie client (RLS-enforced), and the relevant table/row policies (household scoping via `current_household_id()`, or `is_developer_caller()` for feedback) correctly block cross-household/unauthorized mutation at the DB layer even though the app code itself performs no redundant check. Confirmed false positive, not a fix — no code changed.
