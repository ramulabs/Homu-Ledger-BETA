---
id: health-security-b7f1181124
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:17:46.316Z
updated_at: 2026-06-19T19:17:46.316Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/api/auth-log/route.ts:34`
**Severity:** warning

## Description

The `POST` handler (line 34) accepts arbitrary JSON from any unauthenticated caller. It logs user-controlled fields — `fromPath`, `isStandalone`, `hiddenMs`, `note`, and free-form `referer`/`ua` metadata — directly to Vercel runtime logs with no session check:

```typescript
export async function POST(request: NextRequest) {
  let payload: Payload | null = null;
  try { payload = (await request.json()) as Payload; } catch { }
  // logs payload — no auth guard
}
```

Any client can:
- Flood Vercel runtime logs with fake logout-bounce entries, obscuring real diagnostic data
- Log arbitrary strings in `fromPath` and `note` that appear verbatim in production log outputs

The intentional design (no DB write, log-only) reduces severity. However the endpoint exposes internal observability infrastructure to unauthenticated probing.

## Recommended Fix

Add a lightweight session check before logging:

```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new NextResponse(null, { status: 401 });
```

The client-side caller already holds a Supabase session when it fires this endpoint (the bounce only happens from authenticated pages that received an unexpected redirect to `/login`).
