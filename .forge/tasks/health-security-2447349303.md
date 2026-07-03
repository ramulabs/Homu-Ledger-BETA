---
id: health-security-2447349303
title: deleteFeedback server action has no auth/session check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-03T19:15:00.485Z
updated_at: 2026-07-03T19:15:00.485Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

`deleteFeedback(id)` is a `"use server"` action that deletes a row from the `feedback` table using a caller-supplied id, with no `auth.getUser()` call and no developer-role check:
```ts
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  ...
}
```
Same pattern as `updateFeedbackStatus` in the same file (tracked separately) — a state-changing Server Action reachable as its own POST endpoint with zero application-level authorization. It currently relies entirely on the Postgres RLS policy "feedback: dev can delete" (restricts DELETE to `is_developer_caller()`). That policy prevents exploitation today, but the action provides no defense-in-depth and is inconsistent with the rest of the codebase. If the RLS backstop is ever weakened, or this function is refactored to use the service-role `admin` client the way `app/actions/inbox.ts` does, any caller could permanently delete other households' support tickets.

## Recommended Fix

Add an explicit `requireSession()` + `profile.is_developer` check at the top of the function, mirroring `/settings/feedback-admin/page.tsx` and `replyToFeedback` in the same file.
