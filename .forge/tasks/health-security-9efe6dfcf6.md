---
id: "health-security-9efe6dfcf6"
title: "User-supplied cursor params interpolated raw into PostgREST .or() filter string"
status: "backlog"
priority: "P1"
labels:
  - "security"
  - "critical"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A03 (Injection)  
**File:** `app/api/transactions/route.ts:45`  
**Severity:** critical

## Description

The `GET /api/transactions` handler reads `date`, `createdAt`, and `id` directly from URL query parameters (lines 25–27) and concatenates them verbatim into a PostgREST `.or()` filter string at line 45:

```typescript
if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST parses the `.or()` argument as a filter expression. Attacker-controlled content (e.g. `date=2026-01-01,amount.gt.0`) can inject additional filter conditions, bypass cursor restrictions, or leak rows outside the intended page window. Supabase RLS is a second layer of defense but the injection surface exists at the ORM layer before RLS evaluation.

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

Or switch to typed `.lt()` / `.gte()` chained filters which PostgREST parameterizes safely.
