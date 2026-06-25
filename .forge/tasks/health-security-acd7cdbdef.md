---
id: health-security-acd7cdbdef
title: deleteCategory does not verify category belongs to caller's household
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-25T19:11:18.174Z
updated_at: 2026-06-25T19:11:18.174Z
---

**Source:** Security · Missing Authorization (OWASP A01)
**File:** `app/actions/categories.ts:106`
**Severity:** critical

## Description

`deleteCategory` checks authentication but does not verify the category belongs to the caller's household, allowing cross-household deletion.

```typescript
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Missing household ownership check
  const { error } = await supabase.from("categories").delete().eq("id", id);
```

## Remediation

Filter by household before deleting:
```typescript
.eq("id", id)
.eq("household_id", userHouseholdId)
```
