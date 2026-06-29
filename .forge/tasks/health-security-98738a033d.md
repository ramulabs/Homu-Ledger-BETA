---
id: "health-security-98738a033d"
title: "deleteFeedback has no authentication check — any caller can delete any feedback row"
status: "backlog"
priority: "P0"
labels:
  - "security"
  - "critical"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication  
**File:** `app/actions/feedback.ts:91`  
**Severity:** critical

## Description

The `deleteFeedback` function (lines 91–97) issues a DELETE against the `feedback` table without calling `supabase.auth.getUser()` or verifying that the caller has any session at all:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id); // no auth guard
  ...
}
```

The function neither confirms the caller is authenticated nor checks for developer/admin privileges. Any party who can invoke this server action — including a logged-out user hitting the Next.js server action endpoint directly — can delete arbitrary feedback rows if RLS on the feedback table does not restrict deletes to authenticated owners or admins.

## Recommended Fix

Add a `getUser()` guard before the DELETE:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  ...
}
```
