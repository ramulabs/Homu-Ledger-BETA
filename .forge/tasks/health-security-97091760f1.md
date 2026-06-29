---
id: "health-security-97091760f1"
title: "cancelInvitation deletes by ID with no caller ownership check"
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

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/actions/invitations.ts:77`  
**Severity:** warning

> **Closed 2026-06-29:** Issue re-filed as `health-security-129ac9b257` after code moved (cancelInvitation now at line 132). Close this tracking entry.

## Description

The `cancelInvitation` server action deleted a `household_invitations` row filtered only by `invitationId`, without verifying that the authenticated user was the inviter or a household owner.
