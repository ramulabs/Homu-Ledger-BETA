---
id: health-security-eecfa9f413
title: updateFeedbackStatus server action modifies DB without session check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-05-23T19:14:43.063Z
updated_at: 2026-05-23T19:14:43.063Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** \`app/actions/feedback.ts:61\`
**Severity:** critical
**First seen:** 2026-05-23

## Description

The \`updateFeedbackStatus\` server action updates any feedback record's status without verifying the caller's identity. It creates a Supabase client but never calls \`getUser()\`:

\`\`\`typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);  // ← no auth check, no ownership check
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
\`\`\`

This is an admin-only action (status management), but any unauthenticated or unprivileged user who can call this server action can change the status of any feedback entry. The caller only needs to know or guess a valid \`id\`.

## Recommended Fix

Add session verification and an admin role check:

\`\`\`typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // TODO: verify user has admin/staff role before allowing status changes
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
\`\`\`
