---
id: health-security-238493afdb
title: deleteFeedback server action performs DB deletion without authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-17T19:13:00.774Z
updated_at: 2026-06-17T19:13:00.774Z
---

## Missing Authorization — `deleteFeedback`

**File:** `app/actions/feedback.ts:91`

`deleteFeedback` is a `'use server'` action that deletes any `feedback` row by `id` **without any authentication guard**:

```ts
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

An anonymous actor can directly POST to the Next.js server action endpoint and permanently delete any feedback row.

**Fix:** Add session verification at the top (`getUser()` guard), and restrict deletion to the feedback's original submitter or a developer-flagged admin.
