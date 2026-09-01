---
id: health-security-cb03e14996
title: Middleware auth check fails open when Supabase env vars are unset
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-09-01T19:16:08.469Z
updated_at: 2026-09-01T19:16:08.469Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `lib/supabase/middleware.ts:21-23`
**Severity:** warning

## Description
`updateSession()` reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and, if either is missing, returns `NextResponse.next({ request })` immediately — skipping the `auth.getUser()` check and every redirect rule for the rest of the request. A misconfigured deploy (missing env var) silently disables the middleware's auth gate for all routes instead of blocking access. Impact is partly mitigated because `(app)/layout.tsx` independently calls `requireSession()` and server actions/API routes each check `auth.getUser()` themselves, but `app/onboarding/page.tsx` is a client component with no server-side auth check of its own and relies entirely on this middleware for gating.

## Recommended Fix
Fail closed instead: if the required env vars are missing, redirect to an error/maintenance page (or block all non-public routes) rather than passing the request through unauthenticated, and log/alert on this branch so the misconfiguration is surfaced immediately.
