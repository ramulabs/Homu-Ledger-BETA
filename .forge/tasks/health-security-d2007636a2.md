---
id: health-security-d2007636a2
title: deleteFeedback server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-13T19:20:04.724Z
updated_at: 2026-06-13T19:20:04.724Z
---

**Source:** Security · OWASP A01 (Missing Authentication)
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

The `deleteFeedback` server action deletes a feedback row with no authentication or authorization check:

```typescript
export async function deleteFeedback(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  // No getUser(), no ownership check, no admin check
}
```

Any client — authenticated or not — that can invoke this Next.js Server Action can permanently delete any feedback item by UUID. Combined with the missing auth in `updateFeedbackStatus`, the entire feedback lifecycle is exposed without server-side authorization.

## Recommended Fix

Add authentication (and optionally admin check) before deleting:

```typescript
export async function deleteFeedback(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // optionally: verify user is admin or the feedback creator
  const { error } = await supabase.from("feedback").delete().eq("id", id);
}
```
