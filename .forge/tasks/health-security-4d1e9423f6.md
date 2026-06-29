---
id: "health-security-4d1e9423f6"
title: "auth-log API route accepts unauthenticated POST requests"
status: "completed"
priority: "P2"
labels:
  - "security"
  - "warning"
  - "health-check"
created_at: "2026-05-20T17:55:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/api/auth-log/route.ts:1`  
**Severity:** warning

> **Closed 2026-06-29:** Issue re-filed as `health-security-3e2ffde080` after code moved (handler now at line 34). Close this tracking entry.

## Description

The `/api/auth-log` route handler accepted POST requests without any authentication check. The endpoint logged user-supplied fields (`fromPath`, `isStandalone`, `hiddenMs`, `note`) to the server console.
