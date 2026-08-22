---
id: health-security-4c1413c892
title: replyToFeedback lacks developer-role authorization check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:33.978Z
updated_at: 2026-08-22T19:14:33.978Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:72`
**Severity:** critical

## Description

`replyToFeedback` verifies the caller is *authenticated* but never checks that they're a developer/support agent before writing a reply to an arbitrary feedback ticket:

```typescript
export async function replyToFeedback(id: string, reply: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const trimmed = reply.trim();
  if (!trimmed) return { error: "Reply cannot be empty" };
  const { error } = await supabase
    .from("feedback")
    .update({ reply: trimmed, replied_at: new Date().toISOString(), replied_by: user.id })
    .eq("id", id);
```

The function is meant to back the developer-only feedback-admin panel (per the file's own comments and the `feedback: dev can update` RLS policy elsewhere in this file's schema), but the action performs no `is_developer` check and no `id` scoping — it relies entirely on RLS to reject non-developer callers. There is no application-level signal distinguishing an intended admin action from a regular user probing the endpoint.

## Recommended Fix

Add an explicit developer check, mirroring `testGeminiConnection` in `app/actions/ai.ts`:

```typescript
const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
if (!profile?.is_developer) return { error: "Developer access required" };
```
