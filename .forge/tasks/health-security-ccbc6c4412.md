---
id: health-security-ccbc6c4412
title: /api/auth-log accepts unauthenticated POST without rate limiting
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-17T19:13:00.875Z
updated_at: 2026-06-17T19:13:00.875Z
---

## Missing Authentication on diagnostic endpoint

**File:** `app/api/auth-log/route.ts:34`

The `POST /api/auth-log` endpoint accepts JSON payloads and logs them without any authentication or rate-limit check. Currently data is only written to `console.log` (no data exfiltration), but:

1. **Log flooding / log injection:** An attacker can POST high volumes of structured log entries, obscuring real events. The `fromPath` and `note` fields are logged verbatim — log-injection characters could corrupt log format if forwarded to a SIEM.
2. **Reconnaissance:** Confirms the server is reachable.

**Fix:** Add a Supabase session check (`createClient()` + `getUser()`) or HMAC-based request signing. At minimum, add rate-limiting.
