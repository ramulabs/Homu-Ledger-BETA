---
id: health-security-d2007636a2
title: deleteFeedback has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-15T19:17:45.699Z
updated_at: 2026-06-15T19:17:45.699Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** \`app/actions/feedback.ts:91\`
**Severity:** critical

## Description

The \`deleteFeedback\` server action has the same missing authentication pattern as \`updateFeedbackStatus\`: \`createClient()\` is called but \`auth.getUser()\` is never invoked. Any caller can delete any feedback row by supplying its ID, depending on RLS policies.

\`\`\`typescript
export async function deleteFeedback(id: string) {
  const supabase = createClient();
  // No auth.getUser() call
  const { error } = await supabase
    .from("feedback")
    .delete()
    .eq("id", id);
}
\`\`\`

## Recommended Fix

Add authentication check identical to the one recommended for \`updateFeedbackStatus\` (see \`health-security-7a25785cd9\`). Also audit the RLS \`DELETE\` policy on the \`feedback\` table.
