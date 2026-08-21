---
id: health-security-dbdc996420
title: Cursor query params interpolated raw into PostgREST filter string
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-21T19:13:56.827Z
updated_at: 2026-08-21T19:13:56.827Z
---

## Finding

**Source:** Security · OWASP A03 (Injection)
**File:** `app/api/transactions/route.ts:45`
**Severity:** critical

## Description

The cursor pagination in `GET /api/transactions` interpolates raw query-string values into the Supabase PostgREST `.or()` filter string:

```typescript
const date = searchParams.get("date");           // user-controlled
const createdAt = searchParams.get("createdAt"); // user-controlled
const id = searchParams.get("id");                // user-controlled

if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST parses the `.or()` string as a filter expression. If `date` contains a comma or closing parenthesis, additional filter conditions can be injected. Supabase RLS still limits the caller to their own household's rows, so this can't cross household boundaries, but it can bypass the intended cursor window and inject arbitrary predicates against the caller's own transactions.

This is a re-identification of previously-tracked finding `health-security-78445af314` — the interpolation now sits at line 45 (was line 38) after doc-comment additions shifted the file, so this run's line-keyed id changed. The underlying vulnerability and code are otherwise unchanged; the old id is being closed by this run and superseded by this one.

**Severity note:** reassessed to `critical` this run per the "injection" classification rule (previously logged as `warning`).

## Recommended Fix

Validate cursor parameters with strict regexes (date/ISO-timestamp/UUID) before interpolating, or switch to chained `.lt()`/`.gte()` column filters that PostgREST parameterizes safely.

First identified: 2026-05-20 (as health-security-78445af314). Re-identified at new location: 2026-08-21.
