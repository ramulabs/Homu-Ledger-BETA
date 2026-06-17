---
id: health-security-6698795755
title: updateFeedbackStatus server action performs DB write without
  authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-17T19:13:00.673Z
updated_at: 2026-06-17T19:13:00.673Z
---

## Missing Authorization — `updateFeedbackStatus`

**File:** `app/actions/feedback.ts:61`

`updateFeedbackStatus` is a `'use server'` action that updates any `feedback` row's `status` field. It creates a Supabase client and executes the UPDATE **without first calling `supabase.auth.getUser()`**:

```ts
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
```

Any unauthenticated or unauthorized caller can change the status of any feedback row via the Next.js server action POST endpoint.

**Fix:** Add `const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: 'Not authenticated' };` at the top, and verify admin/developer privileges before allowing status mutations.
