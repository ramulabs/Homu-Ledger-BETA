---
id: health-security-7a25785cd9
title: updateFeedbackStatus server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:14:59.505Z
updated_at: 2026-07-21T19:14:59.505Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

## Description

`updateFeedbackStatus` (and its form wrapper `setFeedbackStatusFromForm`) performs a `feedback` table UPDATE with **no authentication check at all** — it doesn't even call `supabase.auth.getUser()`:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

This is a "use server" export, so it is invocable directly via a `Next-Action` POST once its action id is known from the client bundle for `/settings/feedback-admin` — the middleware only gates unauthenticated *page navigation*, not server-action invocation by an authenticated non-developer, and the page-level `is_developer` gate in `app/(app)/settings/feedback-admin/page.tsx` never runs for a direct action call. In practice: any signed-in user (not just developers) can flip the status of any feedback ticket in the system, and an unauthenticated caller may be able to as well if RLS on `feedback` doesn't independently block it.

## Recommended Fix

Require a session and a developer role before touching the table, matching the pattern used elsewhere in the codebase (`app/actions/ai.ts:testGeminiConnection`):

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
  if (!profile?.is_developer) return { error: "Developer access required." };

  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

Apply the same guard to `deleteFeedback` and `replyToFeedback` in the same file, and confirm the RLS policy on `feedback` also restricts UPDATE/DELETE to developers as a second line of defense.
