---
id: health-security-7a25785cd9
title: updateFeedbackStatus server action has no auth check (developer-only
  action, RLS-only enforcement)
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-01T19:16:38.124Z
updated_at: 2026-07-01T19:16:38.124Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:61`
**Severity:** warning

## Description

`updateFeedbackStatus` performs an UPDATE against the `feedback` table with zero authentication or authorization check in the action itself:

```ts
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

As a Next.js Server Action this is exposed as its own POST endpoint regardless of which page renders the trigger button — any authenticated user (or script with a valid session cookie) can invoke it directly, bypassing the `/settings/feedback-admin` page's `if (!profile?.is_developer) redirect(...)` gate, which only runs when the page itself is rendered.

Every other server action in this codebase begins with a session check (`auth.getUser()`), and privileged ones rely on the underlying RPC enforcing `is_developer` server-side. `updateFeedbackStatus` breaks this pattern — it doesn't check for a logged-in user at all, let alone a developer. It is currently backstopped by RLS (`"feedback: dev can update"` policy requiring `is_developer_caller()`), so a non-developer's direct call fails at the DB layer, but the action leaks the raw Postgres error message to any authenticated non-developer caller who tries.

## Recommended Fix

Mirror the pattern used elsewhere in the codebase — check the session and `is_developer` in the action itself rather than relying solely on RLS and the calling page's redirect:

```ts
import { requireSession } from "@/lib/auth/session";

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const { supabase, profile } = await requireSession();
  if (!profile?.is_developer) return { error: "Not authorized" };
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```
