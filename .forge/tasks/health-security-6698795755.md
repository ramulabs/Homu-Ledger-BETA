---
id: health-security-6698795755
title: updateFeedbackStatus has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:20.461Z
updated_at: 2026-06-24T19:11:20.461Z
---

**File:** `app/actions/feedback.ts:61`

The `updateFeedbackStatus` server action creates a Supabase client and immediately calls `.update({ status })` without ever calling `supabase.auth.getUser()` or any session check. An unauthenticated caller can flip the status of any feedback row by knowing its UUID. `setFeedbackStatusFromForm` (line 100) delegates to this function and inherits the same vulnerability.

```ts
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  // NO getUser() call here
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
```

Compare with `createFeedback` (line 20) which correctly checks `if (!user) return { error: 'Not authenticated' }`.

**Fix:** Add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: 'Not authenticated' };` before the DB call.
