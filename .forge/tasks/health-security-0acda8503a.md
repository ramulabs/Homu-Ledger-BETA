---
id: health-security-0acda8503a
title: updateCategory relies solely on RLS for household scoping
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-09T19:12:03.112Z
updated_at: 2026-06-09T19:12:03.112Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** \`app/actions/categories.ts:79\`
**Severity:** warning

## Description

\`updateCategory()\` validates authentication (\`auth.getUser()\`) but does not add a \`household_id\` equality condition to the update query, relying solely on the RLS policy \`categories: members can update\` to scope writes to the caller's household:

\`\`\`typescript
const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id);  // No .eq("household_id", householdId)
\`\`\`

If the RLS policy is weakened, a cross-household update would be possible.

## Recommended Fix

Add an explicit household scope to the update:

\`\`\`typescript
const householdId = await getHouseholdId();
const { error } = await supabase
  .from("categories")
  .update({ name, symbol, color })
  .eq("id", id)
  .eq("household_id", householdId);
\`\`\`
