---
id: health-security-1e00f83d7f
title: replyToFeedback lacks developer-role authorization check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:14:59.626Z
updated_at: 2026-08-03T19:16:14.305Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:72`
**Severity:** critical

## Description

`replyToFeedback` checks that the caller is signed in, but never checks that they are a developer/admin:

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
  ...
}
```

This action is only meant to be used from the `/settings/feedback-admin` support panel (gated to `is_developer` at the page level), but the action itself has no equivalent role check. Any authenticated user who can reach the action id can post a reply — attributed to themselves via `replied_by`, but written into someone else's feedback ticket, including ones from other households — impersonating official support on tickets they don't own.

## Recommended Fix

Add the same developer-role check used in `testGeminiConnection` (`app/actions/ai.ts:375-391`):

```typescript
const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
if (!profile?.is_developer) return { error: "Developer access required." };
```

Insert this immediately after the existing `if (!user)` check, before the update.

Last seen by health check: 2026-08-03T19:16:14.305Z
