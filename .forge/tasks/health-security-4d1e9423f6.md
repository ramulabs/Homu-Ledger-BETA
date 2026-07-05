---
id: health-security-4d1e9423f6
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-20T17:55:00Z
updated_at: 2026-07-05T19:15:03.014Z
---

> **Escalated 2026-07-05:** unresolved for 46 days while still `backlog` (first seen 2026-05-20). Auto-escalated warning → critical per the health-check's 14-day backlog policy. Re-confirmed still present (POST handler now at `route.ts:34`); middleware blocks fully anonymous requests but any request with a session cookie still reaches the unauthenticated handler.

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/api/auth-log/route.ts:1`  
**Severity:** warning

## Description

The `/api/auth-log` route handler accepts POST requests without any authentication check. The endpoint logs user-supplied fields (`fromPath`, `isStandalone`, `hiddenMs`, `note`) to the server console:

```typescript
export async function POST(request: NextRequest) {
  let payload: Payload | null = null;
  try {
    payload = (await request.json()) as Payload;
  } catch { }
  // ... logs payload to console — no auth guard
}
```

Any unauthenticated client can:
- Flood Vercel runtime logs with fake diagnostic entries, obscuring real logout events the endpoint was designed to capture
- Probe which fields are logged to infer what diagnostic metadata the platform captures

The intentional design (no DB write, log only) reduces severity, but the endpoint serves as a signal about internal observability infrastructure.

## Recommended Fix

Add a lightweight session check using the Supabase server client. If no session, return 401 and skip logging. The client-side caller already has a Supabase session when it fires this endpoint (the bounce only happens from authenticated pages):

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  // ... rest of logging logic
}
```

Alternatively, a signed HMAC token generated client-side from the session JWT would work without a Supabase round-trip on the edge runtime.

Last seen by health check: 2026-07-05T19:15:03.014Z
