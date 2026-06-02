---
id: health-security-3db7010422
title: Cursor query params interpolated raw into PostgREST filter string
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
created_at: 2026-06-02T19:11:11.514Z
updated_at: 2026-06-02T19:11:11.514Z
---

## Finding

**Source:** Security · OWASP A03 (Injection)  
**File:** `app/api/transactions/route.ts:44`  
**Severity:** warning

## Description

The cursor pagination in `GET /api/transactions` interpolates raw query-string values into the Supabase PostgREST `.or()` filter string:

```typescript
const date = searchParams.get('date');       // user-controlled
const createdAt = searchParams.get('createdAt'); // user-controlled
const id = searchParams.get('id');           // user-controlled

if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST parses the `.or()` string as a filter expression. If `date` contains a comma or closing parenthesis, additional filter conditions can be injected. Because Supabase RLS is active, an attacker can only affect data within their own household scope — they cannot cross household boundaries. However, they can bypass the cursor restriction and return rows outside the intended page window.

## Recommended Fix

Validate cursor parameters before interpolation:

```typescript
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (date && createdAt && id &&
    DATE_RE.test(date) && ISO_RE.test(createdAt) && UUID_RE.test(id)) {
  query = query.or(`date.lt.${date},...`);
}
```

Or switch to `.lt()` / `.gte()` chained column filters using typed parameters.
