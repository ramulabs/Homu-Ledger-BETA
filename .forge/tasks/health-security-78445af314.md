---
id: "health-security-78445af314"
title: "Cursor query params interpolated raw into PostgREST filter string"
status: "completed"
priority: "P1"
labels:
  - "security"
  - "warning"
  - "health-check"
created_at: "2026-05-20T17:55:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A03 (Injection)  
**File:** `app/api/transactions/route.ts:38`  
**Severity:** warning

> **Closed 2026-06-29:** Issue re-filed as `health-security-9efe6dfcf6` after code moved (injection now at line 45). Close this tracking entry.

## Description

The cursor pagination in `GET /api/transactions` interpolated raw query-string values into the Supabase PostgREST `.or()` filter string.
