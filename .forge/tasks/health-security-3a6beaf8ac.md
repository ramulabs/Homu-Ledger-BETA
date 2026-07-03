---
id: health-security-3a6beaf8ac
title: updateFeedbackStatus server action has no auth/session check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-03T19:15:00.378Z
updated_at: 2026-07-03T19:15:00.378Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

`updateFeedbackStatus(id, status)` is a `"use server"` action that takes fully caller-controlled input and immediately issues an `UPDATE` against the `feedback` table — with no call to `supabase.auth.getUser()`, no session check, and no `is_developer` check anywhere in the function:
```ts
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  ...
}
```
Every other mutating action in this codebase (`replyToFeedback` in the same file, and all of `transactions.ts`, `wallets.ts`, `categories.ts`) starts with an explicit `auth.getUser()` guard, or in admin-only flows uses `requireSession()` + `profile.is_developer`. This action is an outlier. As a Next.js Server Action it is a public POST endpoint reachable directly (not just via the admin UI buttons) by anyone with any session cookie, or none. The Postgres RLS policy "feedback: dev can update" currently backstops this (restricts UPDATE to `is_developer_caller()`), but the application layer provides zero defense-in-depth — any future RLS drift or a switch to a service-role client (as `app/actions/inbox.ts` already does elsewhere) would make this fully unauthenticated.

## Recommended Fix

Add `const { user } = await requireSession(); if (!profile.is_developer) return { error: "Not authorized" };` at the top, matching `/settings/feedback-admin/page.tsx` and `replyToFeedback` in the same file.
