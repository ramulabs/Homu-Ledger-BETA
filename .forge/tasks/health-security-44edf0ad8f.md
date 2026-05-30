---
id: health-security-44edf0ad8f
title: updateFeedbackStatus and deleteFeedback lack explicit auth guards
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-05-30T19:12:05.648Z
updated_at: 2026-05-30T19:12:05.648Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** \`app/actions/feedback.ts:61\`
**Severity:** warning

## Description

Three server actions in \`app/actions/feedback.ts\` perform sensitive write operations without an explicit \`auth.getUser()\` guard:

- \`updateFeedbackStatus\` (line 61) — updates the \`status\` column of any \`feedback\` row by \`id\`.
- \`deleteFeedback\` (line 91) — deletes a \`feedback\` row by \`id\`.
- \`setFeedbackStatusFromForm\` (line 100) — calls \`updateFeedbackStatus\` and also has no auth guard.

Sibling functions \`createFeedback\` (line 20) and \`replyToFeedback\` (line 72) correctly call \`auth.getUser()\` and return 401 when no user is present. The inconsistency is risky for admin-only paths: if the RLS DELETE/UPDATE policy on \`feedback\` is permissive, an unauthenticated or low-privilege caller could modify or erase any feedback record.

## Recommended Fix

Add the standard auth check to each unguarded function, matching the sibling pattern:

\`\`\`typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // ... rest of function
}
\`\`\`

Apply the same fix to \`deleteFeedback\`. The \`setFeedbackStatusFromForm\` wrapper inherits safety once \`updateFeedbackStatus\` is fixed.

Also audit the RLS \`UPDATE\` and \`DELETE\` policies on the \`feedback\` table to confirm they restrict mutations to the row owner or a developer/admin role.
