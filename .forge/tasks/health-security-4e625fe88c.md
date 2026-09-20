---
id: health-security-4e625fe88c
title: Cursor query params interpolated raw into PostgREST filter string
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-09-20T19:17:47.487Z
updated_at: 2026-09-20T19:17:47.487Z
---

## Finding

**Source:** Security · SQL Injection (OWASP A03)
**File:** `app/api/transactions/route.ts:44`
**Severity:** warning

## Description

The cursor pagination in `GET /api/transactions` interpolates raw query-string values into the Supabase PostgREST `.or()` filter string:

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

PostgREST parses the `.or()` string as a filter expression. If `date` contains a comma or closing parenthesis (e.g. `2026-01-01,amount.gt.0`), additional filter conditions can be injected. `transactions` SELECT is RLS-scoped to `current_household_id()` (migration `0001_initial_schema.sql`), so an attacker can only affect data within their own household — they cannot cross household boundaries. However, they can:
- Bypass the cursor restriction and return rows outside the intended page window
- Inject predicates that expose all of their transactions regardless of the cursor

Note: this is the same underlying issue as the previously-tracked injection finding on this route — added documentation comments shifted the vulnerable `if` block a few lines down, which changed this finding's stable id.

## Recommended Fix

Validate and sanitize cursor parameters before interpolation:

```typescript
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (date && createdAt && id &&
    DATE_RE.test(date) && ISO_RE.test(createdAt) && UUID_RE.test(id)) {
  query = query.or(`date.lt.${date},...`);
}
```

Or switch to `.lt()` / `.gte()` chained column filters using typed parameters, which PostgREST parameterizes safely.
