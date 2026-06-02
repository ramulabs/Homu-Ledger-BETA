---
id: health-security-9a5c80c68a
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
  - security
  - warning
  - health-check
created_at: 2026-06-02T19:10:58.200Z
updated_at: 2026-06-02T19:10:58.200Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/api/auth-log/route.ts:37`  
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
- Flood Vercel runtime logs with fake diagnostic entries, obscuring real logout events
- Probe which fields are logged to infer internal observability infrastructure

The intentional design (no DB write, log only) reduces severity, but the endpoint serves as a signal about internal observability.

## Recommended Fix

Add a lightweight session check using the Supabase server client:

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  // ... rest of logging logic
}
```
