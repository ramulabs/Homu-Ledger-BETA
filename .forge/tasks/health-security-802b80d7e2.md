---
id: health-security-802b80d7e2
title: deleteFeedback server action has no authentication guard
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-28T19:15:05.980Z
updated_at: 2026-06-28T19:15:05.980Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

`deleteFeedback` (line 91) creates a Supabase client and immediately deletes a row from the `feedback` table with no authentication check whatsoever. Any caller who can invoke this server action can permanently delete any feedback record by supplying its UUID.

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  // ← no auth check
  const { error } = await supabase.from('feedback').delete().eq('id', id);
```

## Recommended Fix

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  // optionally verify admin role before deleting
  const { error } = await supabase.from('feedback').delete().eq('id', id);
```
