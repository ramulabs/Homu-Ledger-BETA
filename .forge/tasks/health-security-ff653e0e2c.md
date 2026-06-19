---
id: health-security-ff653e0e2c
title: Cursor query params interpolated raw into PostgREST filter string
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:18:07.899Z
updated_at: 2026-06-19T19:18:07.899Z
---

## Finding

**Source:** Security · OWASP A03 (Injection) / PostgREST Filter Injection
**File:** `app/api/transactions/route.ts:45`
**Severity:** warning

## Description

The cursor-pagination block interpolates raw URL query-string values into a PostgREST `.or()` filter string without sanitization (line 45):

```typescript
const date = searchParams.get("date");       // user-controlled
const createdAt = searchParams.get("createdAt"); // user-controlled
const id = searchParams.get("id");           // user-controlled

if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST parses the `.or()` argument as a filter expression. A crafted `date` value (e.g. `2026-01-01)OR(1=1`) can escape the intended cursor logic and inject additional predicates. Supabase RLS limits the blast radius to the caller's own household — they cannot access other households' data — but within their scope they can bypass the cursor restriction and return rows outside the intended page window.

## Recommended Fix

Validate each cursor parameter against a strict regex before interpolating:

```typescript
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (date && createdAt && id &&
    DATE_RE.test(date) && ISO_RE.test(createdAt) && UUID_RE.test(id)) {
  query = query.or(`date.lt.${date},...`);
}
// else: return most-recent page (no cursor)
```

Alternatively, switch to chained `.lt()` / `.gte()` column filters using typed parameters.
