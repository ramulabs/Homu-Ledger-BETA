---
id: health-security-caa4284da7
title: updateCategory trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:55.915Z
updated_at: 2026-06-30T19:17:55.915Z
---

## Description

`updateCategory(id, formData)` (`app/actions/categories.ts:79-104`) authenticates the caller but never verifies that the category `id` belongs to the caller's household before issuing the update:

```typescript
const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id);
```

No `.eq("household_id", profile.household_id)` filter, and the function doesn't even fetch the caller's `household_id`. The only protection is the Postgres RLS policy on `categories` UPDATE. Inconsistent with the sibling `addCategory` in the same file, which correctly scopes inserts to `profile.household_id`.

**Exploit scenario:** if the RLS UPDATE policy on `categories` is ever dropped or weakened, a logged-in user from Household A can call `updateCategory(idFromHouseholdB, formData)` and silently rewrite another household's category.

## Recommended Fix

Fetch the caller's `household_id` (as `addCategory` already does) and add it to the filter:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };
const { error } = await supabase.from("categories").update({ name, symbol, color }).eq("id", id).eq("household_id", profile.household_id);
```
