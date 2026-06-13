---
id: health-security-7a25785cd9
title: updateFeedbackStatus server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:19:50.278Z
updated_at: 2026-06-13T19:19:50.278Z
---

**Source:** Security · OWASP A01 (Missing Authentication)
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

The `updateFeedbackStatus` server action creates a Supabase client and immediately mutates the `feedback` table with no `getUser()` or session check:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id); // ← no auth, no ownership check
  // ...
}
```

Because this is a Next.js Server Action, it can be invoked via POST from any client. An unauthenticated (or cross-site) caller who knows a valid feedback UUID can change any feedback item's status. The feedback admin UI at `/settings/feedback-admin` is middleware-protected, but the action itself is not.

## Recommended Fix

Add authentication and an admin/ownership guard:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // optionally: verify user is admin or the feedback creator
  const { error } = await supabase
    .from("feedback").update({ status }).eq("id", id);
}
```
