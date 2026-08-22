---
id: health-security-89d4277915
title: cancelInvitation deletes by ID with no caller ownership check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-08-22T19:14:34.217Z
updated_at: 2026-08-22T19:14:34.217Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/invitations.ts:132`
**Severity:** critical

## Description

`cancelInvitation` is documented as usable by "inviter or household owner", but the implementation checks only that *some* user is authenticated, then deletes the invitation by `id` alone:

```typescript
/**
 * Cancel a pending invitation (inviter or household owner).
 */
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", invitationId);
```

Compare with `declineInvitation` in the same file, a few lines above, which explicitly fetches the invitation and verifies `invite.invited_user_id === user.id` before mutating. `cancelInvitation` has no equivalent check — it never verifies the caller is the original inviter (`invited_by`) or the owner of the invitation's household. Any authenticated user who learns or guesses another household's invitation id can cancel it, with RLS on `household_invitations` as the only remaining control.

## Recommended Fix

Fetch the invitation first and verify the caller is either the inviter or the household owner before deleting, matching the ownership check style already used in `declineInvitation`:

```typescript
const { data: invite } = await supabase
  .from("household_invitations")
  .select("id, household_id, invited_by")
  .eq("id", invitationId)
  .single();
if (!invite) return { error: "Invitation not found" };

const { data: household } = await supabase
  .from("households").select("owner_id").eq("id", invite.household_id).single();

if (invite.invited_by !== user.id && household?.owner_id !== user.id) {
  return { error: "Not authorized to cancel this invitation" };
}

const { error } = await supabase.from("household_invitations").delete().eq("id", invitationId);
```
