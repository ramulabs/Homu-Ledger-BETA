---
id: health-security-ccbc6c4412
title: Unauthenticated POST endpoint /api/auth-log logs arbitrary caller-supplied data
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-24T19:11:55.704Z
updated_at: 2026-06-24T19:11:55.704Z
---

**File:** `app/api/auth-log/route.ts:34`

The `/api/auth-log` endpoint accepts POST from any caller without authentication or rate-limiting. The `fromPath`, `isStandalone`, `hiddenMs`, and `note` fields from the request body are logged verbatim to the Vercel console.

**Impact:** An attacker can spam the log stream with arbitrary content (log injection / log flooding), potentially obscuring real auth events or inflating Vercel log ingestion costs.

**Fix:** At minimum, truncate and sanitize `note` and `fromPath` fields before logging. Consider adding a simple HMAC token or rate-limiting by IP.
