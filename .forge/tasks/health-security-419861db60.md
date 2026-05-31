---
id: health-security-419861db60
title: cancelInvitation deletes by ID with no ownership verification
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-31T19:11:47.429Z
updated_at: 2026-05-31T19:11:47.429Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/invitations.ts:132`
**Severity:** critical

## Description

The `cancelInvitation` server action deletes a `household_invitations` row filtered only by `invitationId`, without verifying the authenticated user is the inviter (`invited_by`) or a household owner:

```typescript
export async function cancelInvitation(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('household_invitations')
    .delete()
    .eq('id', invitationId); // ← no ownership check
```

Any authenticated user who learns or guesses a valid `invitationId` UUID can cancel any pending invitation in any household. Exploitability depends entirely on whether the Supabase RLS DELETE policy restricts deletions to the `invited_by` user.

## Recommended Fix

Verify ownership before deleting, mirroring the pattern in `declineInvitation`:

```typescript
const { data: invite } = await supabase
  .from('household_invitations')
  .select('id, invited_by, household_id, status')
  .eq('id', invitationId)
  .single();

if (!invite) return { error: 'Invitation not found' };
if (invite.invited_by !== user.id) {
  // check household owner role before allowing cancel
  const { data: membership } = await supabase
    .from('household_members')
    .select('role')
    .eq('household_id', invite.household_id)
    .eq('profile_id', user.id)
    .eq('role', 'owner')
    .maybeSingle();
  if (!membership) return { error: 'Not authorized' };
}
```
