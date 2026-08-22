---
id: health-security-deada49875
title: updateRecurringItem updates by ID with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.642Z
updated_at: 2026-08-22T19:14:33.642Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:74`
**Severity:** critical

## Description

`updateRecurringItem` checks authentication but never resolves or checks `household_id` before the write:

```typescript
export async function updateRecurringItem(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  ...
  const { error } = await supabase
    .from("recurring_items")
    .update({ type, amount, name, category_id, frequency, next_due_date, repeat_until })
    .eq("id", id);
```

Unlike `addRecurringItem` in the same file (which resolves `profile.household_id` and inserts it), the update path drops household scoping entirely. Any authenticated user supplying another household's recurring-item id can modify its amount, name, category, or schedule; only RLS on `recurring_items` stands between this and the reference pattern in `transactions.ts`.

## Recommended Fix

Resolve and scope by `household_id`, mirroring `addRecurringItem`:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("recurring_items")
  .update({ type, amount, name, category_id, frequency, next_due_date, repeat_until })
  .eq("id", id)
  .eq("household_id", profile.household_id);
```
