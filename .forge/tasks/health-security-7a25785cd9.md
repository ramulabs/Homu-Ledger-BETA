---
id: health-security-7a25785cd9
title: updateFeedbackStatus server action missing authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-31T19:11:57.436Z
updated_at: 2026-05-31T19:11:57.436Z
---

## Finding

**Source:** Security · OWASP A07 / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

The `updateFeedbackStatus` server action creates a Supabase client and immediately writes to the `feedback` table without ever calling `supabase.auth.getUser()`:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('feedback')
    .update({ status })
    .eq('id', id);
  // no auth check — any caller can change any feedback status
}
```

Contrast with `replyToFeedback` directly below, which correctly calls `getUser()` and guards on `if (!user)`. Any authenticated or unauthenticated caller that can invoke this server action can change the status of any feedback record.

## Recommended Fix

Add an auth guard consistent with the adjacent `replyToFeedback` function:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // optional: verify user is an admin before proceeding
  const { error } = await supabase
    .from('feedback')
    .update({ status })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/settings/feedback-admin');
  return {};
}
```
