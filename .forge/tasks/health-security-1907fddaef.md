---
id: health-security-1907fddaef
title: updateFeedbackStatus server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-22T19:08:36.940Z
updated_at: 2026-05-22T19:08:36.940Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

`updateFeedbackStatus` is a Next.js server action intended for the admin feedback panel but contains **zero authentication**. It creates a Supabase client and immediately performs a DB update without calling `auth.getUser()`:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  // No getUser() — anyone can call this
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
```

Any unauthenticated caller can change feedback item statuses (open → closed, etc.), suppressing bug reports or user complaints.

**Fix:** Add `auth.getUser()` check and verify the user has an admin/developer role before allowing status changes.
