---
id: health-security-419861db60
title: cancelInvitation deletes by ID with no caller ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-01T19:16:28.352Z
updated_at: 2026-07-01T19:16:28.352Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/invitations.ts:132`
**Severity:** warning

## Description

`cancelInvitation` checks only that the caller is authenticated, then deletes the invitation row by ID with no ownership/household check in the action itself:

```ts
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("household_invitations")
    .delete()
    .eq("id", invitationId);
  ...
}
```

This is currently backstopped by RLS: migration `0008_update_seed_default_wallets_three.sql` defines `"household_invitations: inviter or members can delete"` (`USING (invited_by = auth.uid() OR household_id = public.current_household_id())`), so a non-owning, non-member caller's delete is rejected at the database layer today.

However, the action itself provides no application-layer authorization boundary, breaking the codebase's general convention of checking ownership before acting (see e.g. `declineInvitation` in the same file, which fetches and checks the invite first). If the RLS policy is ever loosened or dropped, this becomes an open "delete any invitation by ID" endpoint for any authenticated user, and today it still returns the raw Postgres/RLS error to the caller on a rejected delete, leaking policy-shape information to unprivileged users.

## Recommended Fix

Check ownership/household membership in the action before deleting, consistent with `declineInvitation`:

```ts
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: invite } = await supabase
    .from("household_invitations")
    .select("id, invited_by, household_id")
    .eq("id", invitationId)
    .single();

  if (!invite || (invite.invited_by !== user.id && invite.household_id !== currentHouseholdId)) {
    return { error: "Not authorized" };
  }

  const { error } = await supabase.from("household_invitations").delete().eq("id", invitationId);
  if (error) return { error: error.message };
  revalidatePath("/settings/members");
  return {};
}
```
