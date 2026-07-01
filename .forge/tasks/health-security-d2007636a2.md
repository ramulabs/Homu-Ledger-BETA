---
id: health-security-d2007636a2
title: deleteFeedback server action has no auth check (developer-only action,
  RLS-only enforcement)
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-01T19:16:46.373Z
updated_at: 2026-07-01T19:16:46.373Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:91`
**Severity:** warning

## Description

Same gap as `updateFeedbackStatus`, but for deletion: `deleteFeedback` issues a `DELETE FROM feedback WHERE id = ...` with no `auth.getUser()` call and no `is_developer` check in the action:

```ts
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

Currently backstopped by the RLS DELETE policy `"feedback: dev can delete"` (`USING (is_developer_caller())`), so a non-developer's direct call fails at the database layer today. But the action provides no application-layer authorization boundary of its own, breaking the codebase-wide convention of checking auth before acting, and leaves deletion of user-submitted feedback tickets entirely dependent on RLS never regressing. It also lets any authenticated non-developer learn (via the returned Postgres error) whether a given feedback row exists — a minor information-disclosure side channel.

## Recommended Fix

Add the same `requireSession()` + `profile.is_developer` guard used on the `/settings/feedback-admin` page:

```ts
import { requireSession } from "@/lib/auth/session";

export async function deleteFeedback(id: string): Promise<Result> {
  const { supabase, profile } = await requireSession();
  if (!profile?.is_developer) return { error: "Not authorized" };
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```
