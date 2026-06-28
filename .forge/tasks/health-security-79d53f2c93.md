---
id: health-security-79d53f2c93
title: updateFeedbackStatus server action has no authentication guard
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-28T19:15:05.881Z
updated_at: 2026-06-28T19:15:05.881Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

`updateFeedbackStatus` (line 61) creates a Supabase client and immediately calls `.update({ status })` on the `feedback` table with no call to `supabase.auth.getUser()` and no authentication guard. Any unauthenticated or unauthorized caller who can invoke this server action can change the status of any feedback row by ID. Compare with `replyToFeedback` on line 72 which correctly authenticates first.

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  // ← no auth.getUser() call
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
```

## Recommended Fix

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // optionally verify user is an admin
  const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
```
