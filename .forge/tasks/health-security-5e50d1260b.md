---
id: health-security-5e50d1260b
title: auth-log API route accepts unauthenticated POST requests
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-15T19:17:10.328Z
updated_at: 2026-06-15T19:17:10.328Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** \`app/api/auth-log/route.ts:34\`
**Severity:** warning

## Description

The \`/api/auth-log\` route handler accepts POST requests without any authentication check. The endpoint logs user-supplied fields (\`fromPath\`, \`isStandalone\`, \`hiddenMs\`, \`note\`) to the server console with no JWT or session verification:

\`\`\`typescript
export async function POST(request: NextRequest) {
  let payload: Payload | null = null;
  try {
    payload = (await request.json()) as Payload;
  } catch { }
  // logs payload to console — no auth guard
}
\`\`\`

Any unauthenticated client can flood Vercel runtime logs with fake diagnostic entries, obscuring real logout events this endpoint was designed to capture.

## Recommended Fix

Add a session check using the Supabase server client:

\`\`\`typescript
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  // ... rest of logging logic
}
\`\`\`
