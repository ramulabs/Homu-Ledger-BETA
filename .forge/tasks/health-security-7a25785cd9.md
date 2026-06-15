---
id: health-security-7a25785cd9
title: updateFeedbackStatus has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-15T19:17:45.590Z
updated_at: 2026-06-15T19:17:45.590Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** \`app/actions/feedback.ts:61\`
**Severity:** critical

## Description

The \`updateFeedbackStatus\` server action calls \`createClient()\` but never calls \`supabase.auth.getUser()\`. Any unauthenticated caller (or any authenticated user) can update the status of any feedback row by supplying an arbitrary ID:

\`\`\`typescript
export async function updateFeedbackStatus(id: string, status: string) {
  const supabase = createClient();
  // No auth.getUser() call — no authentication check
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
}
\`\`\`

Whether this is exploitable without authentication depends entirely on the RLS policy on the \`feedback\` table. If no RLS policy restricts updates, any caller can change feedback status.

## Recommended Fix

Add an explicit authentication check at the top of the function:

\`\`\`typescript
export async function updateFeedbackStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) return { error: "Not authenticated" };
  // ... rest of the function
}
\`\`\`
