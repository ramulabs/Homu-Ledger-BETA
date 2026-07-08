---
id: health-security-bf96c0d1ff
title: updateFeedbackStatus/deleteFeedback perform no in-code auth check
  (RLS-mitigated)
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-08T19:14:14.499Z
updated_at: 2026-07-08T19:14:14.499Z
---

**Source:** Security · OWASP A01 (Broken Access Control) — defense-in-depth gap (new finding)
**File:** `app/actions/feedback.ts:61-70` (updateFeedbackStatus), `app/actions/feedback.ts:91-97` (deleteFeedback)
**Severity:** warning

## Description

Unlike every other server action in the codebase (including `replyToFeedback` and `createFeedback` in the same file), `updateFeedbackStatus` and `deleteFeedback` never call `supabase.auth.getUser()` — they go straight to `.update()`/`.delete()` filtered only by `.eq("id", id)`. This is mitigated by RLS: migrations 0020/0021 restrict `feedback` UPDATE/DELETE to `is_developer_caller()`, so an unauthorized caller's mutation is silently dropped (0 rows affected) rather than succeeding. This is a defense-in-depth gap and an inconsistency with the rest of the codebase's pattern (app-level session check + RLS as second layer), not an exploitable vulnerability today — but if the RLS policy is ever loosened or the table is ever queried through the admin client, there would be no application-level backstop.

## Recommended Fix

Add the same `getUser()` + `is_developer` guard used elsewhere in this file, for consistency and defense-in-depth.
