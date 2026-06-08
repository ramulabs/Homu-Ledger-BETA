---
id: health-security-3157ea8f70
title: updateFeedbackStatus server action missing authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-08T19:09:54.665Z
updated_at: 2026-06-08T19:09:54.665Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

The `updateFeedbackStatus` and `setFeedbackStatusFromForm` server actions (lines 61 and 100) do not call `getUser()` or verify authentication before performing DB writes. Sibling actions (`createFeedback`, `replyToFeedback`) do verify auth — the missing check here is inconsistent and violates defense-in-depth.

An unauthenticated caller can invoke these actions; the only protection is RLS on the `feedback` table. If the RLS policy has any gap, there is no application-layer safety net.

**Fix:**

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // ... existing update ...
}
```
