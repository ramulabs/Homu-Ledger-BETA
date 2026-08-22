---
id: health-security-fe48535056
title: deleteFeedback server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:34.090Z
updated_at: 2026-08-22T19:14:34.090Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

`deleteFeedback` deletes a feedback ticket by `id` with no authentication or authorization check whatsoever:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  ...
```

No `supabase.auth.getUser()` call exists in this function at all — it's indistinguishable, at the application layer, from an unauthenticated delete. As with `updateFeedbackStatus` in the same file, the `feedback: dev can delete` RLS policy is the sole enforcement point; the server action supplies none.

## Recommended Fix

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
  if (!profile?.is_developer) return { error: "Developer access required" };

  const { error } = await supabase.from("feedback").delete().eq("id", id);
  ...
```
