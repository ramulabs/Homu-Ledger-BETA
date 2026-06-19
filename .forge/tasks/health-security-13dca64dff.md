---
id: health-security-13dca64dff
title: updateFeedbackStatus server action has no authentication check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:18:50.206Z
updated_at: 2026-06-19T19:18:50.206Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** warning

## Description

`updateFeedbackStatus` (line 61) creates a Supabase client but never calls `auth.getUser()` to confirm who the caller is, then immediately updates the `feedback` table:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);  // no auth check before this mutation
```

Compare `createFeedback` (line 20) and `replyToFeedback` (line 72), both of which call `supabase.auth.getUser()` and return `{ error: "Not authenticated" }` if the user is absent.

Next.js server actions provide CSRF protection (they require a signed action ID), but they do not prevent an authenticated user from calling this action on any feedback item. Without a `getUser()` check, the function also provides no guard against callers who somehow bypass the server-action endpoint.

## Recommended Fix

Add a session check matching the pattern used by the other actions in this file:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // optionally: verify caller is a developer before allowing status change
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  ...
}
