---
id: health-security-d2007636a2
title: deleteFeedback server action lacks authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-25T19:11:17.982Z
updated_at: 2026-06-25T19:11:17.982Z
---

**Source:** Security · Missing Authorization (OWASP A01)
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

The `deleteFeedback` server action deletes any feedback record without verifying the caller is authenticated.

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

Any request to this action can delete any feedback item without authorization checks.

## Remediation

Add authentication before the delete:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
```
