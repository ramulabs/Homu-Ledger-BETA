---
id: health-security-bf9b9b5eb3
title: deleteFeedback server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-22T19:08:51.535Z
updated_at: 2026-05-22T19:08:51.535Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

`deleteFeedback` is a server action with **no authentication at all**. It creates a Supabase client and immediately deletes the row:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  // No getUser() — anyone can call this
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

Any unauthenticated caller who can enumerate or guess feedback UUIDs can permanently delete user feedback submissions, destroying bug reports and feature requests.

**Fix:** Add `auth.getUser()` check and verify admin/developer role before allowing deletions.
