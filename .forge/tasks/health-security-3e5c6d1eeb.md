---
id: health-security-3e5c6d1eeb
title: deleteFeedback server action missing authentication check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-27T19:13:35.914Z
updated_at: 2026-05-27T19:13:35.914Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** warning

The `deleteFeedback()` server action deletes feedback records without verifying that the caller is authenticated. Unlike `replyToFeedback()` which checks `!user`, `deleteFeedback` calls `.delete()` on the `feedback` table immediately after acquiring the Supabase client.

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  // ← no getUser() or session check
  const { error } = await supabase.from("feedback").delete().eq("id", id);
}
```

If the Supabase RLS `DELETE` policy on `feedback` does not restrict deletions to admins or the feedback owner, any unauthenticated request can permanently delete any feedback entry by its ID.

## Recommended Fix

Add auth guard identical to `replyToFeedback`:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
```
Also audit and tighten the RLS `DELETE` policy on the `feedback` table to enforce admin-only deletions.
