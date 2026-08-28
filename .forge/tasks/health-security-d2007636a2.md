---
id: health-security-d2007636a2
title: deleteFeedback server action has no authentication check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-07-21T19:14:59.368Z
updated_at: 2026-08-28T19:12:25.807Z
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

## Description

`deleteFeedback` performs a `feedback` table DELETE with **no authentication check at all**:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

Every other action in this file that touches user data at least calls `supabase.auth.getUser()`; this one skips it entirely. `/settings/feedback-admin` (the only UI surface that references this action) is gated to `is_developer` users at the page level (`app/(app)/settings/feedback-admin/page.tsx:8`), but that check runs during SSR page render only — it does not run again when the server action itself is invoked directly via a `Next-Action` POST, which any authenticated (and possibly unauthenticated) caller can do once the action id is known from the shipped JS bundle. This lets any user permanently delete any feedback ticket, including tickets they don't own, with no audit trail.

## Recommended Fix

Add an explicit auth + developer-role check at the top of the action, matching `testGeminiConnection` in `app/actions/ai.ts:375-391`:

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
  if (!profile?.is_developer) return { error: "Developer access required." };

  const { error } = await supabase.from("feedback").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings/feedback-admin");
  return {};
}
```

Also add/verify an RLS DELETE policy on `feedback` restricted to developers, so the database enforces this even if a future code change drops the application-level check again.

Last seen by health check: 2026-08-28T19:12:25.807Z


## Deep health check follow-up (2026-08-28)

Re-verified this run. The app-code gap described above is real, but Postgres RLS appears to fully cover it: `feedback: dev can delete` (migration 0020) — `USING (is_developer_caller())`.

This looks like it may have been flagged without checking RLS. Recommend a human confirms the policy is still in force (no later migration weakens it) and, if so, downgrades or closes this task — the automated check cannot itself verify RLS coverage, so it is left open pending that confirmation rather than auto-closed.
