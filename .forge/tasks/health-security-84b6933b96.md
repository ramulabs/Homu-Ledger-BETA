---
id: health-security-84b6933b96
title: replyToFeedback has no admin role check — any authenticated user can post
  as support staff
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-22T19:08:51.642Z
updated_at: 2026-05-22T19:08:51.642Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Authorization
**File:** `app/actions/feedback.ts:72`
**Severity:** critical

`replyToFeedback` is intended for developer/admin replies but only checks that the user is authenticated — it does not verify the caller has an admin or developer role:

```typescript
export async function replyToFeedback(id: string, reply: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // No role check — any user can reply
  const { error } = await supabase
    .from("feedback")
    .update({ reply: trimmed, replied_at: ..., replied_by: user.id })
    .eq("id", id);
```

Any signed-in user can post "admin replies" to any feedback item, impersonating support staff and potentially misleading the submitter.

**Fix:** Verify the caller has an admin/developer role (e.g., check a `user_roles` table or a special field on `profiles`) before allowing the reply.
