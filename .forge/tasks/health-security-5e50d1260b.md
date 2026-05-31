---
id: health-security-5e50d1260b
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-31T19:11:17.049Z
updated_at: 2026-05-31T19:11:17.049Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/api/auth-log/route.ts:34`
**Severity:** critical

## Description

The `/api/auth-log` route handler's `POST` function (line 34) accepts requests without any authentication check. The endpoint logs user-supplied fields (`fromPath`, `isStandalone`, `hiddenMs`, `note`) to the server console:

```typescript
export async function POST(request: NextRequest) {
  let payload: Payload | null = null;
  try {
    payload = (await request.json()) as Payload;
  } catch { }
  // logs payload — no auth guard whatsoever
}
```

Any unauthenticated client can flood Vercel runtime logs with fake diagnostic entries, obscuring real logout events this endpoint was designed to capture.

## Recommended Fix

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  // rest of logging logic
}
```
