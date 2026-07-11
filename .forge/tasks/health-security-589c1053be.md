---
id: health-security-589c1053be
title: Feedback admin actions rely solely on RLS with no app-level authz check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-11T19:19:23.432Z
updated_at: 2026-07-11T19:19:23.432Z
---

**Source:** Security · OWASP A01 (Missing Authorization — defense-in-depth gap)
**File:** `app/actions/feedback.ts:61-70,91-97`
**Severity:** warning

## Description

`updateFeedbackStatus` and `deleteFeedback` call Supabase directly with no `supabase.auth.getUser()` check and no developer-role check — they rely entirely on the RLS policies `"feedback: dev can update"`/`"feedback: dev can delete"` (both `USING (public.is_developer_caller())`, restricted `to authenticated`). Today this is not exploitable — RLS denies non-developers and anonymous callers — but every other mutating action in the codebase (`categories.ts`, `wallets.ts`, `invitations.ts`, etc.) checks `getUser()` in-code even where RLS also enforces the rule, and these two functions are the only exceptions. Any future change that swaps in the admin/service-role client, or a bug in the RLS policy, would turn this into an unauthenticated read/write of all users' support tickets with no code-level backstop.

## Recommended Fix

Add an explicit `requireSession()` + `profile.is_developer` check in both functions, matching the pattern already used in the gating pages (`app/(app)/settings/feedback-admin/page.tsx:8`).
