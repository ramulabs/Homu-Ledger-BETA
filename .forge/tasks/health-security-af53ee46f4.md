---
id: health-security-af53ee46f4
title: Cursor query params interpolated raw into PostgREST filter string
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-31T19:11:33.287Z
updated_at: 2026-05-31T19:11:33.287Z
---

## Finding

**Source:** Security · OWASP A03 (Injection)
**File:** `app/api/transactions/route.ts:45`
**Severity:** critical

## Description

The cursor pagination in `GET /api/transactions` interpolates raw query-string values into the Supabase PostgREST `.or()` filter string:

```typescript
const date = searchParams.get("date");
const createdAt = searchParams.get("createdAt");
const id = searchParams.get("id");

if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST parses `.or()` as a filter expression. If `date` contains a comma or closing parenthesis an attacker can inject additional filter conditions, bypassing the cursor restriction.

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
