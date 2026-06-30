---
id: health-security-52bb2f6c34
title: updateRecurringItem trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.430Z
updated_at: 2026-06-30T19:17:56.430Z
---

## Description

`updateRecurringItem(id, formData)` (`app/actions/recurring.ts:74-110`) never fetches or checks `household_id` before updating:

```typescript
const { error } = await supabase.from("recurring_items").update({ type, amount: Number(amount), name, category_id: category_id || null, frequency, next_due_date: next_due_date || null, repeat_until: repeat_until || null }).eq("id", id);
```

Unlike `addRecurringItem` in the same file, which scopes inserts to `profile.household_id`, this update relies entirely on RLS. It also accepts a client-supplied `category_id` without verifying it belongs to the same household.

**Exploit scenario:** if the `recurring_items` UPDATE RLS policy is ever regressed, any authenticated user could rewrite another household's recurring rule (amount, frequency, due dates) by supplying its id — recurring items materialize into real transactions on schedule, so this is a path to injecting fraudulent future transactions into another household's ledger.

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };
const { error } = await supabase.from("recurring_items").update({ ... }).eq("id", id).eq("household_id", profile.household_id);
```

Also validate that `category_id`, when provided, belongs to the same household before writing it.
