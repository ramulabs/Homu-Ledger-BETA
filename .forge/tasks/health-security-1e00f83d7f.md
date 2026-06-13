---
id: health-security-1e00f83d7f
title: replyToFeedback has auth but no admin or ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-13T19:20:04.630Z
updated_at: 2026-06-13T19:20:04.630Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:72`
**Severity:** warning

## Description

`replyToFeedback` verifies the caller is authenticated (`getUser()`) but does not restrict which authenticated user can reply to which feedback:

```typescript
export async function replyToFeedback(id: string, reply: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // No check: is user the feedback creator? Is user an admin?
  const { error } = await supabase
    .from("feedback")
    .update({ reply: trimmed, replied_at: ..., replied_by: user.id })
    .eq("id", id);
}
```

Any authenticated user (including regular household members) can write a reply on any feedback item and mark themselves as `replied_by`. This bypasses the intended admin-only reply flow visible in the `/settings/feedback-admin` UI.

## Recommended Fix

Verify that the caller is an admin (e.g., by checking a `profiles.role` or `is_admin` flag) before allowing a reply, or restrict via RLS so only admin service-role calls can update `reply`/`replied_by` columns.
