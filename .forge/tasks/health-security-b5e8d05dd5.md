---
id: health-security-b5e8d05dd5
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-08-22T19:14:34.441Z
updated_at: 2026-08-22T19:14:34.441Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/api/auth-log/route.ts:34`
**Severity:** warning

## Description

`POST /api/auth-log` accepts and processes a JSON body from any caller with no session check and no CSRF/Origin verification:

```typescript
export async function POST(request: NextRequest) {
  let payload: Payload | null = null;
  try {
    payload = (await request.json()) as Payload;
  } catch { ... }
  const ua = request.headers.get("user-agent") ?? "unknown";
  const referer = request.headers.get("referer") ?? "none";
  console.log("[auth-log]", JSON.stringify({ ts: ..., fromPath: payload?.fromPath ?? null, ... }));
  return new NextResponse(null, { status: 204 });
}
```

The route is deliberately public by design (it fires on the /login bounce path, before a session necessarily exists) and does no DB writes — it only logs to Vercel's console. The practical risk is limited to log-injection / log-flooding (an attacker can POST arbitrary `fromPath`/`note`/`hiddenMs` strings that get written verbatim into structured logs used for the "random logout" investigation), and volumetric abuse since there's no rate limiting. Still, `middleware.ts`'s `PUBLIC_ROUTES`/`AUTH_PASSTHROUGH` allowlist doesn't cover `/api/auth-log` explicitly, and there's no size cap on the body being logged.

## Recommended Fix

Cap the size of logged fields and consider a lightweight rate limit or same-origin check, since this is diagnostic infrastructure that doesn't need to accept traffic from anywhere but the app itself:

```typescript
const origin = request.headers.get("origin");
if (origin && new URL(origin).host !== request.nextUrl.host) {
  return new NextResponse(null, { status: 204 }); // silently drop cross-origin noise
}
// ...and truncate payload.note / payload.fromPath before logging.
```
