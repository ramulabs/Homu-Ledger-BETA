---
id: health-security-78d54025af
title: updateRecurringItem mutates by ID with no household ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-28T19:15:44.810Z
updated_at: 2026-06-28T19:15:44.810Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/recurring.ts:74`
**Severity:** warning

## Description

`updateRecurringItem` (line 74) authenticates via `supabase.auth.getUser()` but never fetches the caller's `household_id` and never adds a household filter to its UPDATE. The mutation is scoped only by the record `id`. An authenticated user who knows the UUID of a recurring item in another household can modify its type, amount, name, category, frequency, or due dates.

## Recommended Fix

Fetch the caller's `household_id` from their profile and add `.eq('household_id', householdId)` to the UPDATE.
