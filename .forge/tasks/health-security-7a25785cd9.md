---
id: health-security-7a25785cd9
title: updateFeedbackStatus server action lacks authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-25T19:11:02.059Z
updated_at: 2026-06-25T19:11:02.059Z
---

**Source:** Security · Missing Authorization (OWASP A01)
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

The `updateFeedbackStatus` server action updates any feedback item's status without verifying the caller is authenticated or has admin privileges.

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
```

Any user (or unauthenticated caller) can change the status of any feedback record.

## Remediation

Add authentication and authorization before the update:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
// Verify admin role if applicable
```
