---
id: health-security-858c01dca9
title: cancelInvitation does not verify caller is inviter or household owner
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-24T19:11:41.518Z
updated_at: 2026-06-24T19:11:41.518Z
---

**File:** `app/actions/invitations.ts:139`

The `cancelInvitation` action checks the user is authenticated but then calls `.delete().eq("id", invitationId)` with no check that the caller is the person who sent the invite or an owner of the relevant household. Any authenticated user who knows an invitation UUID can cancel it.

```ts
const { error } = await supabase
  .from("household_invitations")
  .delete()
  .eq("id", invitationId);  // missing: .eq("invited_by", user.id) or owner check
```

**Fix:** Add `.eq("invited_by", user.id)` to restrict cancellation to the original inviter, or add a household-owner authorization check.
