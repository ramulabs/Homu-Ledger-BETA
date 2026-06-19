---
id: health-security-129ac9b257
title: cancelInvitation deletes by ID with no caller ownership check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-19T19:18:32.528Z
updated_at: 2026-06-19T19:18:32.528Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Ownership Verification
**File:** `app/actions/invitations.ts:132`
**Severity:** warning

## Description

`cancelInvitation` (line 132) authenticates the caller but issues `.delete().eq("id", invitationId)` with no check that the authenticated user is the inviter (`invited_by`) or a household owner:

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

Compare `declineInvitation` (line 102), which correctly validates `invite.invited_user_id !== user.id`. Any authenticated user who discovers or guesses a valid `invitationId` UUID can cancel any pending invitation in any household. Exploitability depends on whether the Supabase RLS `DELETE` policy on `household_invitations` restricts deletions — if it does not, this is the only gate.

## Recommended Fix

Verify ownership before deleting:

```typescript
const { data: invite } = await supabase
  .from("household_invitations")
  .select("id, invited_by, household_id, status")
  .eq("id", invitationId)
  .single();

if (!invite) return { error: "Invitation not found" };
if (invite.status !== "pending") return { error: "Invitation is no longer pending" };

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

Also audit the RLS `DELETE` policy on `household_invitations` to enforce the same constraint at the DB level.
