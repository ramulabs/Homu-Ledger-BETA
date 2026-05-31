---
id: health-security-d2007636a2
title: deleteFeedback server action missing authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-31T19:12:04.570Z
updated_at: 2026-05-31T19:12:04.570Z
---

## Finding

**Source:** Security · OWASP A07 / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

The `deleteFeedback` server action deletes a `feedback` row without any call to `supabase.auth.getUser()`:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('feedback').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/settings/feedback-admin');
  return {};
}
```

Any caller who can invoke this server action — unauthenticated or otherwise — can delete any feedback record by UUID. Supabase RLS may provide a backstop, but in-code auth guards are required as defense in depth.

## Recommended Fix

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // optional: verify admin role before proceeding
  const { error } = await supabase.from('feedback').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/settings/feedback-admin');
  return {};
}
```
