---
id: health-security-e6d4ace730
title: deleteRecurringItem deletes by ID with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-28T19:15:44.904Z
updated_at: 2026-06-28T19:15:44.904Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:112`
**Severity:** warning

## Description

`deleteRecurringItem` (line 112) authenticates via `supabase.auth.getUser()` but never fetches or enforces the caller's `household_id`. The DELETE is scoped only by `id`. An authenticated user who knows a recurring item UUID from another household can delete it.

## Recommended Fix

Fetch the caller's household and add `.eq('household_id', householdId)` to the DELETE.
