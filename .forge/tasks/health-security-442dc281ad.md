---
id: health-security-442dc281ad
title: signTransactionPhoto signs any storage path with no household ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-09-12T19:13:26.739Z
updated_at: 2026-09-12T19:13:26.739Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/photos.ts:14`
**Severity:** critical

## Description

`signTransactionPhoto` checks that the caller is authenticated, but never verifies that the supplied storage `path` actually belongs to the caller's household before minting a signed URL for it:

```typescript
export async function signTransactionPhoto(path: string): Promise<{ url?: string; error?: string }> {
  if (!path) return { error: "No path supplied" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  ...
  const { data, error } = await supabase.storage
    .from("transaction-photos")
    .createSignedUrl(objectPath, 60 * 60); // no ownership/household check on objectPath
```

Object keys are shaped `<household_id>/<uuid>.<ext>` (see `lib/upload-photo.ts`). Any authenticated user who obtains or guesses another household's `<household_id>/<uuid>.<ext>` path (e.g. leaked via a screenshot, shared link, browser history, or referrer header) can call this action directly with that path. The action does nothing to confirm the path belongs to the caller's own household — it relies entirely on the `can_access_transaction_photo` Postgres RLS policy on `storage.objects` to block cross-household reads. This is the same "trust RLS alone, no app-level ownership check" pattern already flagged repeatedly elsewhere in this codebase (`updateWallet`, `deleteWallet`, `updateCategory`) — a defense-in-depth gap that becomes a live breach if that one RLS policy is ever weakened, dropped, or misapplied by a future migration.

## Recommended Fix

Resolve the caller's `household_id` and verify the path's leading segment matches it before calling `createSignedUrl`, so the check doesn't depend solely on the storage RLS policy:

```typescript
export async function signTransactionPhoto(path: string): Promise<{ url?: string; error?: string }> {
  if (!path) return { error: "No path supplied" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles").select("household_id").eq("id", user.id).single();
  if (!profile?.household_id) return { error: "No household" };

  const publicPrefix = "/storage/v1/object/public/transaction-photos/";
  const idx = path.indexOf(publicPrefix);
  const objectPath = idx === -1 ? path : decodeURIComponent(path.slice(idx + publicPrefix.length));

  if (!objectPath.startsWith(`${profile.household_id}/`)) {
    return { error: "Not authorized for this photo" };
  }

  const { data, error } = await supabase.storage
    .from("transaction-photos")
    .createSignedUrl(objectPath, 60 * 60);
```

Also confirm the `can_access_transaction_photo` RLS policy (migration 0011) continues to independently enforce this at the database level.
