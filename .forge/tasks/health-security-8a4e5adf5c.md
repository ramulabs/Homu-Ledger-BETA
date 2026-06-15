---
id: health-security-8a4e5adf5c
title: deleteCategory deletes by id with no household-scoping
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-15T19:17:59.704Z
updated_at: 2026-06-15T19:17:59.704Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / IDOR
**File:** `app/actions/categories.ts:110`
**Severity:** warning

## Description

`deleteCategory` operates on the `categories` table filtering only by `id` — no `.eq("household_id", householdId)` scope is applied. While Supabase RLS may enforce household-level isolation at the DB layer, the server action itself provides no defense-in-depth ownership check.

Any authenticated user who knows or guesses a valid row ID can attempt to mutate/delete rows in other households if the RLS policies are incomplete or misconfigured.

## Recommended Fix

Scope the query with the caller's household ID:

```typescript
const householdId = await getHouseholdId(supabase, user.id);
const { error } = await supabase
  .from("categories")
  .update(/* or delete */)
  .eq("id", id)
  .eq("household_id", householdId); // ← add this
```

Also audit the RLS policies on `categories` to confirm household-level isolation is enforced at the database layer.
