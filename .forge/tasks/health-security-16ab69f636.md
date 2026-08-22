---
id: health-security-16ab69f636
title: Cursor query params interpolated raw into PostgREST filter string
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-08-22T19:14:34.329Z
updated_at: 2026-08-22T19:14:34.329Z
---

## Finding

**Source:** Security · OWASP A03 (Injection)
**File:** `app/api/transactions/route.ts:46`
**Severity:** warning

## Description

The `date`, `createdAt`, and `id` cursor values come straight from `URLSearchParams` (fully attacker-controlled query-string values) and are interpolated, unescaped, into a PostgREST filter string passed to `.or()`:

```typescript
const { searchParams } = new URL(req.url);
const date = searchParams.get("date");
const createdAt = searchParams.get("createdAt");
const id = searchParams.get("id");
...
if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

PostgREST's `.or()` filter syntax treats commas, dots, and parentheses as structural — none of the query params are validated (as a date, timestamp, or UUID) or escaped before being spliced into the filter expression. A caller can supply a `date`/`createdAt`/`id` value containing characters like `,`, `(`, `)`, or additional `and(...)`/`or(...)` clauses to alter the filter's structure, e.g. inject extra OR-branches or malformed operators. This is not classic SQL string-concatenation into raw SQL, but it is the PostgREST-filter equivalent, and it's explicitly called out as the injection vector this house's ruleset watches for.

The route is authenticated (`getUser()` check present) and RLS on `transactions` scopes rows to the caller's household regardless of filter manipulation, which caps the practical impact to malformed queries / potential DoS via a broken filter expression rather than cross-tenant data exposure — hence `warning` rather than `critical`.

## Recommended Fix

Validate each cursor component's shape before use (e.g. `date` matches `YYYY-MM-DD`, `createdAt` is a parseable ISO timestamp, `id` is a UUID) and reject the request with 400 if not, or build the filter with parameterized `.lt()`/`.eq()` chains instead of a single interpolated `.or()` string:

```typescript
const UUID_RE = /^[0-9a-f-]{36}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
if (date && createdAt && id) {
  if (!ISO_RE.test(date) || !ISO_RE.test(createdAt) || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```
