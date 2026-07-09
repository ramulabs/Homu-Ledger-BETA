---
id: health-security-aace940b91
title: Category/wallet/recurring-item update & delete actions omit household_id
  scoping (RLS-only)
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-09T19:13:37.240Z
updated_at: 2026-07-09T19:13:37.240Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / IDOR (defense-in-depth)
**File:** `app/actions/wallets.ts:116` (`updateWallet`, `deleteWallet`, `setDefaultWallet`), `app/actions/categories.ts` (`updateCategory`, `deleteCategory`), `app/actions/recurring.ts` (`updateRecurringItem`, `deleteRecurringItem`)
**Severity:** warning

## Description

These six mutations all do `.eq("id", id)` only — none of them add `.eq("household_id", householdId)` the way `app/actions/transactions.ts`'s `updateTransaction`/`deleteTransaction` consistently do. This means the application layer alone would let one household's member pass an arbitrary UUID from another household and attempt to mutate it.

This is currently blocked by RLS: `categories`/`wallets`/`recurring_items` all carry update/delete policies scoped to `household_id = public.current_household_id()` (migrations `0001_initial_schema.sql`, `0011_lock_down_ledger_membership_and_storage.sql`, `0018_categories_type_and_delete_policy.sql`). A cross-household attempt fails silently (0 rows affected) rather than succeeding — so this is not currently exploitable for a cross-tenant write. But it is an inconsistent pattern versus the rest of the codebase and removes the second layer of defense that the transactions actions deliberately have; a future change to use a service-role/admin client here would turn this into a live cross-household IDOR.

## Recommended Fix

Add explicit `.eq("household_id", householdId)` (via the existing `getHouseholdId()` helper already present in `wallets.ts`) to every update/delete call in these three files, matching the pattern already used in `app/actions/transactions.ts`.
