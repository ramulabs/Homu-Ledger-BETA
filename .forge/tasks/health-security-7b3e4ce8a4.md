---
id: "health-security-7b3e4ce8a4"
title: "updateRecurringItem and deleteRecurringItem update/delete by id with no household scoping"
status: "backlog"
priority: "P2"
labels:
  - "security"
  - "warning"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/actions/recurring.ts:93`  
**Severity:** warning

## Description

Both `updateRecurringItem` (line 74) and `deleteRecurringItem` (line 112) authenticate the user via `getUser()` but issue UPDATE/DELETE scoped only to the caller-supplied `id` with `.eq('id', id)` and no `household_id` filter. The household ID is not fetched or used in either mutation (lines 93–104, 117). An authenticated user who can guess or enumerate a valid `recurring_items.id` belonging to a different household can modify or delete that recurring rule if RLS on `recurring_items` allows cross-household writes.

## Recommended Fix

Fetch the caller's household and add it to the WHERE clause:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

await supabase
  .from("recurring_items")
  .update({...})
  .eq("id", id)
  .eq("household_id", profile.household_id); // add this
```
