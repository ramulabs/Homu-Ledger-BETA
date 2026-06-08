---
id: health-security-6903f13e2d
title: deleteFeedback server action missing authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-08T19:09:54.760Z
updated_at: 2026-06-08T19:09:54.760Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

The `deleteFeedback` server action (line 91) performs a DB delete without calling `getUser()` or verifying the caller is authenticated. The only protection is the Supabase RLS `DELETE` policy on `feedback`. Any unauthenticated caller can invoke this action; if RLS misconfigures or the policy is loosened, there is no server-side guard.

**Fix:**

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // ... existing delete ...
}
```
