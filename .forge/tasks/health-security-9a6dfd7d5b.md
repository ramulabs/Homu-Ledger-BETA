---
id: health-security-9a6dfd7d5b
title: cancelInvitation deletes by ID with no caller ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-09-20T19:17:47.386Z
updated_at: 2026-09-20T19:17:47.386Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/invitations.ts:132`
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

Contrast with `declineInvitation`, which correctly validates `invite.invited_user_id !== user.id`. Any authenticated user who learns or guesses a valid `invitationId` UUID can cancel any pending invitation in any household, subject to whatever the RLS `DELETE` policy on `household_invitations` allows.

The RLS DELETE policy on `household_invitations` (migration `0008_update_seed_default_wallets_three.sql`) is:

```sql
CREATE POLICY "household_invitations: inviter or members can delete"
  ON public.household_invitations FOR DELETE
  USING (invited_by = auth.uid() OR household_id = public.current_household_id());
```

This blocks cross-household deletes, but it means ANY member of the household — not just the inviter or an owner — can cancel another member's pending invitation. That is a real, currently-exploitable within-household authorization gap (not just app-level defense-in-depth), since the policy itself is broader than "inviter or owner".

Note: this is the same underlying issue as the previously-tracked `cancelInvitation` finding — the function moved further down the file (new comments/functions were added above it), which shifted its declaration line and changed this finding's stable id.

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

Also tighten the RLS `DELETE` policy on `household_invitations` to `invited_by = auth.uid() OR EXISTS (owner membership check)` instead of any household member.
