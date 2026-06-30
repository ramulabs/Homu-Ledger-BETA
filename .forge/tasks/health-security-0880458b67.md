---
id: health-security-0880458b67
title: deleteRecurringItem trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.544Z
updated_at: 2026-06-30T19:17:56.544Z
---

## Description

`deleteRecurringItem(id)` (`app/actions/recurring.ts:112-122`) deletes by id with no household filter and no household lookup at all:

```typescript
const { error } = await supabase.from("recurring_items").delete().eq("id", id);
```

The only protection is the RLS DELETE policy on `recurring_items`. Inconsistent with `addRecurringItem` in the same file.

**Exploit scenario:** if the `recurring_items` DELETE RLS policy is ever regressed, any authenticated user could delete another household's recurring rules (e.g. silently cancelling their rent or salary recurring entries) by guessing/enumerating ids.

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };
const { error } = await supabase.from("recurring_items").delete().eq("id", id).eq("household_id", profile.household_id);
```
