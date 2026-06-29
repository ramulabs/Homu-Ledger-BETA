---
id: "health-security-bf2e061d18"
title: "updateCategory updates by id only with no household_id scoping"
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
**File:** `app/actions/categories.ts:94`  
**Severity:** warning

## Description

The `updateCategory` action (lines 79–104) authenticates the user but then issues `supabase.from('categories').update({...}).eq('id', id)` with only the category `id` in the WHERE clause and no `household_id` constraint (line 94–97). If Supabase RLS policies on the `categories` table do not enforce household membership on UPDATE, any authenticated user can rename or re-symbol any category across all households by supplying an arbitrary category UUID. Compare with `addCategory` (line 17) which correctly scopes inserts to `profile.household_id`.

## Recommended Fix

Fetch the user's household and add it to the WHERE clause:

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };

const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id)
  .eq("household_id", profile.household_id); // ← add this
```

Also audit the RLS `UPDATE` policy on `categories` to confirm household scoping is enforced at the database level.
