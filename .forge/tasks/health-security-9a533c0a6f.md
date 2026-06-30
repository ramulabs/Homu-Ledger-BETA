---
id: health-security-9a533c0a6f
title: deleteCategory trusts client-supplied id with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-30T19:17:56.022Z
updated_at: 2026-06-30T19:17:56.022Z
---

## Description

`deleteCategory(id)` (`app/actions/categories.ts:106-117`) deletes a category by id with no household-scoping filter and no household lookup at all:

```typescript
const { error } = await supabase.from("categories").delete().eq("id", id);
```

Like `updateCategory`, the only protection is RLS. The destructive operation has no explicit ownership check, unlike `addCategory`.

**Exploit scenario:** if the RLS DELETE policy on `categories` is ever weakened, any authenticated user could delete any other household's categories by id, cascading to orphan/null `category_id` on that household's transactions.

## Recommended Fix

```typescript
const { data: profile } = await supabase.from("profiles").select("household_id").eq("id", user.id).single();
if (!profile?.household_id) return { error: "No household" };
const { error } = await supabase.from("categories").delete().eq("id", id).eq("household_id", profile.household_id);
```
