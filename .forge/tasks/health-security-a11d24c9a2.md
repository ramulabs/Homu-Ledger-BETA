---
id: health-security-a11d24c9a2
title: updateCategory does not verify category belongs to caller's household
status: backlog
priority: P0
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Critical
  - Security
created_at: 2026-06-25T19:11:18.080Z
updated_at: 2026-06-25T19:11:18.080Z
---

**Source:** Security · Missing Authorization (OWASP A01)
**File:** `app/actions/categories.ts:79`
**Severity:** critical

## Description

`updateCategory` checks the caller is authenticated but does not verify the category belongs to the caller's household. An attacker can update categories in other households by guessing UUIDs.

```typescript
export async function updateCategory(id: string, formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Missing household ownership check
  const { error } = await supabase
    .from("categories")
    .update({ name, symbol, color })
    .eq("id", id);
```

## Remediation

Add household ownership to the WHERE clause:
```typescript
.eq("id", id)
.eq("household_id", userHouseholdId)
```
