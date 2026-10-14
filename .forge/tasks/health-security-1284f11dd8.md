---
id: health-security-1284f11dd8
title: Move-to-ledger relocates any client-supplied photo_url path with service
  role — cross-household photo copy/delete
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-10-14T19:07:27.606Z
updated_at: 2026-10-14T19:07:27.606Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `lib/move-server.ts:141` (input accepted unvalidated at `app/actions/transactions.ts:75` and `:142`)
**Severity:** critical

## Description

New in v1.48.3. `createTransaction`/`updateTransaction` store `photo_url` straight from `formData` with no check that it points inside the caller's own household folder. `moveTransaction` then calls `relocateMovedPhoto(getAdminClient(), …)`, which derives `from` from that stored value and, using the **service-role** storage client, does `copy(from, to)` into the target ledger's folder and then `remove([from])`.

A signed-in user can therefore set `photo_url` on their own transaction to `<victimHouseholdId>/<file>`, move the transaction between two of their own ledgers, and the server will copy the victim household's photo into the attacker's ledger (readable via their storage RLS) and delete the original. Exploitation needs the victim's household UUID + file name (paths leaked through shared/public-bucket URLs), so likelihood is low, but the service-role call bypasses storage RLS entirely.

## Recommended Fix

- Validate `photo_url` on create/update: it must be a path (or public URL) whose first segment equals the transaction's own `household_id`.
- In `relocateMovedPhoto`, require `folder` to equal the transaction's *source* household id (pass it in from before the RPC) and skip otherwise.

