---
id: health-security-ff788c1b71
title: Cursor params injected raw into PostgREST filter — SQL injection vector
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-17T19:13:00.573Z
updated_at: 2026-06-17T19:13:00.573Z
---

## OWASP A03 — SQL Injection via unsanitized cursor query parameters

**File:** `app/api/transactions/route.ts:46`

The `date`, `createdAt`, and `id` query parameters are interpolated directly into a PostgREST `.or()` filter string without any validation:

```ts
query = query.or(
  `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
);
```

An attacker can inject PostgREST filter operators to manipulate the query beyond the cursor window. RLS provides a backstop but is not a substitute for input validation.

**Fix:** Validate each parameter against its expected format before use:
- `date` → `/^\d{4}-\d{2}-\d{2}$/`
- `createdAt` → ISO 8601 timestamp
- `id` → UUID pattern `/^[0-9a-f-]{36}$/i`
