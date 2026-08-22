---
id: health-security-13dca64dff
title: updateFeedbackStatus server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.860Z
updated_at: 2026-08-22T19:14:33.860Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

`updateFeedbackStatus` is a `"use server"` action reachable from the client with an arbitrary feedback `id` and `status`, but it never calls `supabase.auth.getUser()` or performs any authentication check before writing:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  ...
```

Every other mutating action in the codebase (including this same file's `replyToFeedback`) at minimum verifies `user` before proceeding. Here, the RLS policy `feedback: dev can update` (`using (public.is_developer_caller())`) is the *only* thing preventing a non-developer or even a session-less caller from flipping ticket status — the server action itself provides zero authorization signal and silently no-ops rather than surfacing a clear "Not authenticated"/"Forbidden" error, which also makes this class of bug easy to miss in testing.

## Recommended Fix

Add an explicit auth + developer-role check before the write, consistent with the rest of the codebase's defense-in-depth pattern:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
  if (!profile?.is_developer) return { error: "Developer access required" };

  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  ...
```
