---
id: health-security-9e5a974769
title: updateFeedbackStatus server action has no authentication or
  developer-role check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-22T19:11:52.500Z
updated_at: 2026-06-22T19:11:52.500Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:61`
**Severity:** critical

`updateFeedbackStatus()` is a server action that updates feedback ticket status without calling `supabase.auth.getUser()` and without verifying the caller has a developer role. The UI page (`settings/feedback-admin/page.tsx`) guards the view, but server actions are callable directly by any client, bypassing the page-level guard. Any authenticated user (or unauthenticated caller if RLS is permissive) can change the status of any feedback ticket.

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  // ← no getUser(), no developer role check
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
```

**Fix:** Add authentication and developer-role verification before performing the update:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).single();
if (!profile?.is_developer) return { error: "Developer access required" };
```
