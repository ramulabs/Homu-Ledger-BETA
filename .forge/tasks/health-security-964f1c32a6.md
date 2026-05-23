---
id: health-security-964f1c32a6
title: deleteFeedback server action deletes records without session check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-23T19:14:50.672Z
updated_at: 2026-05-23T19:14:50.672Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** \`app/actions/feedback.ts:91\`
**Severity:** critical
**First seen:** 2026-05-23

## Description

The \`deleteFeedback\` server action deletes any feedback record without verifying the caller's identity. It creates a Supabase client but never calls \`getUser()\`:

\`\`\`typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  // ← no auth check, no ownership check
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
\`\`\`

Any unauthenticated or unprivileged caller who knows a valid feedback \`id\` can permanently delete any feedback entry. This is an irreversible destructive action.

## Recommended Fix

Add session verification and an admin role check:

\`\`\`typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // TODO: verify user has admin/staff role before allowing deletion
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
\`\`\`
