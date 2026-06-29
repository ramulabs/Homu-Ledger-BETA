---
id: "health-security-3e2ffde080"
title: "Diagnostic auth-log endpoint accepts unauthenticated POSTs with no rate-limiting"
status: "backlog"
priority: "P2"
labels:
  - "security"
  - "warning"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/api/auth-log/route.ts:34`  
**Severity:** warning

## Description

The `POST /api/auth-log` handler (line 34) logs arbitrary client-supplied JSON (`fromPath`, `isStandalone`, `hiddenMs`, `note` — all free-form) to Vercel's runtime logs without any authentication check, session verification, or rate limit. While the middleware redirects browser navigations to `/login`, `fetch`/`XMLHttpRequest` calls from any source — including bots or other servers — bypass the redirect and reach this handler. Any party with knowledge of this endpoint can flood the Vercel log stream with arbitrary content, potentially obscuring real diagnostic signals, triggering log-storage costs, or injecting misleading breadcrumbs. The `note` field is unbounded and unsanitized.

## Recommended Fix

Add a lightweight session check:

```typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  // ... existing logging logic
}
```

Alternatively, add a signed HMAC token generated client-side from the session JWT to avoid a round-trip on the edge runtime.
