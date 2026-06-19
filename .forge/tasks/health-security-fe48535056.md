---
id: health-security-fe48535056
title: deleteFeedback server action has no authentication check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:18:58.785Z
updated_at: 2026-06-19T19:18:58.785Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** warning

## Description

`deleteFeedback` (line 91) creates a Supabase client and immediately deletes the feedback row without calling `auth.getUser()`:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

Like `updateFeedbackStatus` in the same file, there is no session check. While the Supabase service client is authenticated at the service level, there is no application-layer check to confirm: (a) that a user session exists, or (b) that the caller has the authority to delete the feedback item (e.g., they are the creator or a developer).

## Recommended Fix

Add a session check and role verification before performing the delete:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Verify caller is developer or the original submitter before deleting
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  ...
}
