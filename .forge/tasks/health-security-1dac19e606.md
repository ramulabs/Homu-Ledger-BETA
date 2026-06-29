---
id: "health-security-1dac19e606"
title: "updateFeedbackStatus has no authentication check — any caller can update any feedback row"
status: "backlog"
priority: "P0"
labels:
  - "security"
  - "critical"
  - "health-check"
created_at: "2026-06-29T00:00:00Z"
updated_at: "2026-06-29T00:00:00Z"
---

## Finding

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication  
**File:** `app/actions/feedback.ts:61`  
**Severity:** critical

## Description

The `updateFeedbackStatus` function (lines 61–70) creates a Supabase client and immediately performs an UPDATE without ever calling `supabase.auth.getUser()` or verifying a session:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ status })
    .eq("id", id); // no auth guard whatsoever
  ...
}
```

If the `feedback` table's RLS UPDATE policy permits the anon role or any authenticated user to change status on any row, then any caller — authenticated or not — can flip the status of any feedback entry. This function backs the `/settings/feedback-admin` admin panel, which implies developer-only access, yet there is no role check at all. The helper `setFeedbackStatusFromForm` (line 100) delegates directly to this function and inherits the same gap.

## Recommended Fix

Add a `getUser()` guard and (ideally) a developer-role check:

```typescript
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Optional: verify developer role
  // if (!DEVELOPER_EMAILS.includes(user.email)) return { error: "Not authorized" };
  const { error } = await supabase.from("feedback").update({ status }).eq("id", id);
  ...
}
```
