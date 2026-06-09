---
id: health-security-44edf0ad8f
title: updateFeedbackStatus and deleteFeedback missing explicit auth check
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-09T19:12:02.975Z
updated_at: 2026-06-09T19:12:02.975Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** \`app/actions/feedback.ts:61,91\`
**Severity:** warning

## Description

\`updateFeedbackStatus()\` and \`deleteFeedback()\` both perform database mutations without an explicit \`auth.getUser()\` call. Access is guarded solely by the Supabase RLS policy \`is_developer_caller()\`, which is not visible in the application code:

\`\`\`typescript
// Line 61
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  // No auth.getUser() check

// Line 91
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  // No auth.getUser() check
\`\`\`

If the RLS policy is misconfigured or removed, non-developer users could update or delete any feedback row.

## Recommended Fix

Add explicit auth checks for defense-in-depth, mirroring the pattern in other action files:

\`\`\`typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
\`\`\`
