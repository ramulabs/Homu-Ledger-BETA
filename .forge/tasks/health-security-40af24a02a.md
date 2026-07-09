---
id: health-security-40af24a02a
title: Feedback admin mutations have no in-code auth/role check (RLS-only)
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-09T19:13:37.119Z
updated_at: 2026-07-09T19:13:37.119Z
---

## Finding

**Source:** Security · Missing Authorization (defense-in-depth)
**File:** `app/actions/feedback.ts:61` (`updateFeedbackStatus`) and `:91` (`deleteFeedback`)
**Severity:** warning

## Description

Every other server action in this codebase begins with `const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: "Not authenticated" };`. `updateFeedbackStatus` and `deleteFeedback` skip this entirely — they call `supabase.from("feedback").update(...)`/`.delete(...)` directly with no session check and no developer-role check in application code.

Currently this is not exploitable: RLS policies `"feedback: dev can update"` and `"feedback: dev can delete"` (migration `0020_feedback_ticketing.sql`) restrict both operations `to authenticated` `using (public.is_developer_caller())`, so a non-developer (or anonymous) caller's mutation silently affects 0 rows. But it is a real defense-in-depth gap: these two functions are one refactor away from becoming exploitable (e.g. if a future change swaps in an admin/service-role client the way `app/actions/inbox.ts` does for other admin-ish operations, or if the RLS policy is ever loosened), at which point any authenticated user could alter or delete any other user's support ticket — including tickets containing PII/attachments from other households.

## Recommended Fix

Add the same `auth.getUser()` + `profile.is_developer` check used elsewhere (e.g. mirror `testGeminiConnection` in `app/actions/ai.ts`) at the top of `updateFeedbackStatus`, `replyToFeedback`, and `deleteFeedback`, so the authorization is enforced in two independent layers instead of relying solely on RLS.
