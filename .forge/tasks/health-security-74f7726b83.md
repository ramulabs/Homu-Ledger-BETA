---
id: health-security-74f7726b83
title: User-controlled cursor values interpolated raw into PostgREST .or()
  filter string
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-24T19:11:55.571Z
updated_at: 2026-06-24T19:11:55.571Z
---

**File:** `app/api/transactions/route.ts:45`

The `date`, `createdAt`, and `id` query-string parameters are interpolated directly into the `.or()` filter string without sanitization:

```ts
query = query.or(
  `date.lt.${date},and(date.eq.${date},created_at.lt.${createdAt}),and(date.eq.${date},created_at.eq.${createdAt},id.lt.${id})`
);
```

If Supabase's PostgREST client does not parameterize this string, a crafted value could escape the intended filter and manipulate the query logic (PostgREST injection).

**Fix:** Validate `date` and `createdAt` against ISO date/datetime regex and `id` against UUID format before interpolation.
