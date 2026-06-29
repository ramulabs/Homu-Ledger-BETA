---
id: "health-security-129ac9b257"
title: "cancelInvitation deletes any invitation row without verifying the caller owns it"
status: "backlog"
priority: "P1"
labels:
  - "security"
  - "critical"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)  
**File:** `app/actions/invitations.ts:132`  
**Severity:** critical

## Description

The `cancelInvitation` server action (lines 132–146) verifies only that the caller is authenticated, then unconditionally deletes the `household_invitations` row matching the supplied `invitationId` with no check that the caller is the original inviter (`invited_by`), a household owner, or even a member of the invitation's household:

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

Any authenticated user who learns or guesses a valid `invitationId` UUID can cancel any pending invitation in any household. Compare with `declineInvitation` (line 102) which correctly validates `invite.invited_user_id !== user.id`.

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
