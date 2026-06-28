---
id: health-security-4de6f2847c
title: deleteWallet not scoped to caller's household — cross-household deletion
  possible
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-28T19:15:44.715Z
updated_at: 2026-06-28T19:15:44.715Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/wallets.ts:125`
**Severity:** warning

## Description

`deleteWallet` (line 125) also calls `getHouseholdId()` but discards `householdId`. The DELETE is filtered only by `id`. An authenticated user who knows a wallet UUID from another household can delete it (subject only to the `is_default` guard and RLS).

## Recommended Fix

Add `.eq('household_id', householdId)` to both the preflight SELECT and the DELETE, and assert `householdId` is not null before proceeding.
