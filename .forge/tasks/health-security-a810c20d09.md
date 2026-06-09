---
id: health-security-a810c20d09
title: updateWallet relies solely on RLS for household scoping
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-06-09T19:12:03.246Z
updated_at: 2026-06-09T19:12:03.246Z
---

**Source:** Security · OWASP A01 (Broken Access Control)
**File:** \`app/actions/wallets.ts:88\`
**Severity:** warning

## Description

\`updateWallet()\` retrieves the household ID via \`getHouseholdId()\` for authentication but does not include it as a filter condition on the update, relying solely on RLS for household scoping:

\`\`\`typescript
const { supabase } = await getHouseholdId();
if (!supabase) return { error: "Not authenticated" };

const { error } = await supabase.from("wallets").update(update).eq("id", id);
// Missing: .eq("household_id", householdId)
\`\`\`

If RLS is misconfigured, a user could update a wallet belonging to a different household.

## Recommended Fix

Explicitly scope the update to the caller's household:

\`\`\`typescript
const { supabase, householdId } = await getHouseholdId();
if (!supabase || !householdId) return { error: "Not authenticated" };

const { error } = await supabase
  .from("wallets")
  .update(update)
  .eq("id", id)
  .eq("household_id", householdId);
\`\`\`
