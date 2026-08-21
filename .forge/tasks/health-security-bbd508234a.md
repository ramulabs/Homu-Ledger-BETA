---
id: health-security-bbd508234a
title: cancelInvitation deletes by ID with no caller ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-21T19:13:56.721Z
updated_at: 2026-08-21T19:13:56.721Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/invitations.ts:132`
**Severity:** critical

## Description

`cancelInvitation` deletes a `household_invitations` row filtered only by `invitationId`, without verifying that the authenticated user is the inviter (`invited_by`) or a household owner:

```typescript
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("household_invitations").delete().eq("id", invitationId); // no ownership check
  ...
}
```

Contrast with `declineInvitation` in the same file, which correctly validates `invite.invited_user_id !== user.id`. Any authenticated user who learns or guesses a valid `invitationId` UUID can cancel any pending invitation in any household, unless RLS independently restricts DELETE to the inviter/owner.

This is a re-identification of previously-tracked finding `health-security-97091760f1` — the function moved from line 77 to line 132 in this file as unrelated functions (`inviteMember`, `acceptInvitation`, `declineInvitation`) were added above it, so this run's line-keyed id changed. The underlying vulnerability and code are otherwise unchanged; the old id is being closed by this run and superseded by this one.

## Recommended Fix

Verify ownership before deleting, mirroring `declineInvitation`'s pattern (fetch the invite, check `invited_by === user.id` or household-owner membership) before the delete.

First identified: 2026-05-20 (as health-security-97091760f1). Re-identified at new location: 2026-08-21.
