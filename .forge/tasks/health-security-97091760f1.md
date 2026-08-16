---
id: health-security-97091760f1
title: cancelInvitation lets any household member cancel invites they didn't
  send, contradicting its own docstring
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-20T17:55:00Z
updated_at: 2026-08-16T19:19:30.147Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/actions/invitations.ts:77`  
**Severity:** warning

## Description

The `cancelInvitation` server action deletes a `household_invitations` row filtered only by `invitationId`, without verifying that the authenticated user is the inviter (`invited_by`) or a household owner:

```typescript
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", invitationId); // ← no ownership check
```

Contrast with `declineInvitation`, which correctly validates `invite.invited_user_id !== user.id`. Any authenticated user who learns or guesses a valid `invitationId` UUID can cancel any pending invitation in any household. Whether this is exploitable depends entirely on whether the Supabase RLS `DELETE` policy on `household_invitations` restricts deletions to the `invited_by` user or household owner. If it does not, the server action provides no additional check.

## Recommended Fix

Verify ownership before deleting, mirroring the pattern in `declineInvitation`:

```typescript
const { data: invite } = await supabase
  .from("household_invitations")
  .select("id, invited_by, household_id, status")
  .eq("id", invitationId)
  .single();

if (!invite) return { error: "Invitation not found" };
if (invite.status !== "pending") return { error: "Invitation is no longer pending" };

// Verify caller is the inviter or a household owner
if (invite.invited_by !== user.id) {
  const { data: membership } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", invite.household_id)
    .eq("profile_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!membership) return { error: "Not authorized" };
}
```

Also audit the RLS `DELETE` policy on `household_invitations` to ensure it enforces the same constraint at the database level.

## Update — 2026-08-16

Checked the RLS policy this run (`supabase/migrations/0008_update_seed_default_wallets_three.sql`):

```sql
CREATE POLICY "household_invitations: inviter or members can delete"
  ON public.household_invitations FOR DELETE
  USING (invited_by = auth.uid() OR household_id = public.current_household_id());
```

This *does* scope deletes to the caller's own household — an attacker guessing another household's `invitationId` cannot delete it, so the "any authenticated user in any household" framing above is not accurate. The remaining issue is narrower: the policy allows **any member of the household**, not just the inviter or an owner, so a regular member can cancel an invite someone else sent — looser than the function's own docstring ("Cancel a pending invitation (inviter or household owner)") describes. No cross-tenant exposure, no financial data involved. Downgraded from a cross-tenant IDOR to a same-household permission/consistency gap; fix either the docstring or the RLS policy to match the intended access model (see `cancelInvitation` in `app/actions/invitations.ts`).

Last seen by health check: 2026-08-16T19:19:30.147Z
