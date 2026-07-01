---
id: health-security-4e625fe88c
title: Unvalidated query params concatenated into a PostgREST .or() filter string
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-01T19:16:17.853Z
updated_at: 2026-07-01T19:16:17.853Z
---

## Finding

**Source:** Security · OWASP A03 (Injection)
**File:** `app/api/transactions/route.ts:44`
**Severity:** critical

## Description

`GET /api/transactions` builds a pagination cursor by splicing the raw `date`, `createdAt`, and `id` query-string parameters directly into a PostgREST filter-expression string passed to `.or()`:

```ts
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

None of the three values are validated (no date format check, no UUID check on `id`) before being embedded in PostgREST's filter mini-language, which itself uses commas, dots, and parentheses as syntactically significant characters — a raw, string-concatenated query fragment built from untrusted input handed to a DB query call.

Concrete attack: a caller can pass crafted `date`/`createdAt`/`id` values designed to inject extra `or(...)` clauses or break out of the intended `and(...)` grouping. Because the `transactions` table is protected by RLS scoped to the caller's household, the practical blast radius is likely bounded to filter-logic corruption/DoS (malformed queries, unintended row sets) within the attacker's own authorized rows — but this is exactly the kind of unvalidated-input-into-query-DSL primitive that becomes a full cross-tenant injection if the filter is ever extended, or if PostgREST parsing conflates it with `select` overrides. Classified critical per this routine's injection-category severity rule.

## Recommended Fix

Validate and constrain each cursor field before use:

```ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
if (date && (!DATE_RE.test(date) || Number.isNaN(Date.parse(createdAt ?? "")) || !UUID_RE.test(id ?? ""))) {
  return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
}
```

Alternatively, replace the string-built `.or()` with Supabase's structured filter builder (chained `.lt()`/`.eq()` calls per branch, unioned client-side) to avoid string interpolation into the filter DSL entirely.
