---
id: health-security-a65daa16a8
title: Global session middleware intercepts sessionless webhook/API-key routes
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-11T19:19:23.324Z
updated_at: 2026-07-11T19:19:23.324Z
---

**Source:** Security · OWASP A01 (Inconsistent Authorization Enforcement)
**File:** `lib/supabase/middleware.ts:5,16,74`
**Severity:** warning

## Description

The global session middleware's matcher covers essentially every path including `/api/*` (only static assets are excluded). `updateSession()` redirects any cookie-less request to `/login` unless the path is in `PUBLIC_ROUTES` or `AUTH_PASSTHROUGH` — and those lists do not include `/api/inbox/email`, `/api/inbox/transactions`, or `/api/auth-log`.

Those three routes are specifically designed to be called by clients with no Supabase session cookie: `/api/inbox/email` is a Cloudflare Worker webhook authenticated by HMAC signature, `/api/inbox/transactions` is authenticated by a Bearer API key for n8n/power users, and `/api/auth-log` is deliberately unauthenticated by design. Because middleware runs first and redirects any cookie-less request regardless of HTTP method, genuine external webhook/API-key callers never reach the handler's own signature/token verification — the request becomes a redirect to `/login`, silently breaking the inbound-email and n8n-integration features rather than any code path being insecure. Not yet caught in production because the Cloudflare Email Routing step ("RAM-25 Phase 1") hasn't been wired up yet.

## Recommended Fix

Add these paths (or an `/api/webhooks`, `/api/inbox` prefix convention) to an explicit bypass list in `middleware.ts`, since they already implement their own authentication.
