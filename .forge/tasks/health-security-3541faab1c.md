---
id: health-security-3541faab1c
title: deleteFeedback server action has no authentication or developer-role check
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-22T19:11:52.591Z
updated_at: 2026-06-22T19:11:52.591Z
---

**Source:** Security · OWASP A01 (Broken Access Control) / Missing Authentication
**File:** `app/actions/feedback.ts:91`
**Severity:** critical

`deleteFeedback()` is a server action that permanently deletes feedback records without any authentication check or developer-role gate. Any caller can invoke it directly. If RLS does not restrict deletes to developer accounts, any authenticated user can delete any feedback ticket.

```typescript
export async function deleteFeedback(id: string): Promise<Result> {
  const supabase = await createClient();
  // ← no getUser(), no developer role check
  const { error } = await supabase.from("feedback").delete().eq("id", id);
```

**Fix:** Add authentication and developer-role verification, mirroring the pattern in `createFeedback`:
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return { error: "Not authenticated" };
const { data: profile } = await supabase.from("profiles").select("is_developer").eq("id", user.id).single();
if (!profile?.is_developer) return { error: "Developer access required" };
```
