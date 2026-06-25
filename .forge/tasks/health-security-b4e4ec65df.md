---
id: health-security-b4e4ec65df
title: Postgrest filter injection via unvalidated cursor params in transactions API
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-25T19:10:57.554Z
updated_at: 2026-06-25T19:10:57.554Z
---

**Source:** Security · SQL/Filter Injection (OWASP A03)
**File:** `app/api/transactions/route.ts:46`
**Severity:** critical

## Description

Query parameters `date`, `createdAt`, and `id` are directly interpolated into the Postgrest `.or()` filter string without any validation or escaping. An attacker can inject Postgrest filter operators to manipulate the query logic.

```typescript
if (date && createdAt && id) {
  query = query.or(
    `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
  );
}
```

An attacker can send `?date=2026-05-08,or(1=1)&createdAt=...&id=...` to modify the filter conditions and potentially access transactions from other households.

## Remediation

Validate each cursor parameter against its expected type before use:
```typescript
if (date && createdAt && id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}T/.test(createdAt) || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  query = query.or(`date.lt.${date},...`);
}
```
