---
id: health-security-238493afdb
title: deleteFeedback has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:20.593Z
updated_at: 2026-06-24T19:11:20.593Z
---

**File:** `app/actions/feedback.ts:91`

The `deleteFeedback` server action creates a Supabase client and immediately deletes a row without any `getUser()` call or session validation. An unauthenticated caller can permanently delete any feedback record by knowing its UUID.

```ts
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  // NO getUser() call here
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

**Fix:** Add authentication check before the delete.
