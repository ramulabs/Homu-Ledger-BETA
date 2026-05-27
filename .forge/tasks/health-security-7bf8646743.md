---
id: health-security-7bf8646743
title: updateFeedbackStatus server action missing authentication check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-27T19:13:35.785Z
updated_at: 2026-05-27T19:13:35.785Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** warning

The `updateFeedbackStatus()` server action modifies feedback records without verifying that the caller is authenticated. While sibling functions `replyToFeedback()` and `submitFeedback()` both call `supabase.auth.getUser()` and guard on `!user`, `updateFeedbackStatus` makes no auth check before calling `.update({ status })` on the `feedback` table.

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  // ← no getUser() or session check
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
}
```

Whether this is exploitable depends on the Supabase RLS `UPDATE` policy on the `feedback` table. If RLS does not restrict status updates to admins or the feedback owner, any unauthenticated request can alter the status of any feedback entry.

## Recommended Fix

Add auth guard matching the pattern in `replyToFeedback`:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
```
Also audit the RLS `UPDATE` policy on `feedback` to ensure it restricts status changes to admins.
