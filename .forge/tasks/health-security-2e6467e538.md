---
id: health-security-2e6467e538
title: replyToFeedback server action has no developer-role check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-22T19:11:52.686Z
updated_at: 2026-06-22T19:11:52.686Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** `app/actions/feedback.ts:72`
**Severity:** critical

`replyToFeedback()` checks authentication (`getUser()`) but does not verify the caller has a developer role. Any authenticated user can post an official reply to any feedback ticket, impersonating developer responses and potentially sending misleading communications to users.

```typescript
export async function replyToFeedback(id: string, reply: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // ← no developer role check
  const { error } = await supabase.from("feedback").update({ reply: trimmed, replied_by: user.id }).eq("id", id);
```

**Fix:** Add a developer-role gate after the auth check:
```typescript
const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).single();
if (!profile?.is_developer) return { error: "Developer access required" };
```
