---
id: health-security-03cddf9939
title: Suspicious instruction-injection content in AGENTS.md
status: backlog
priority: P2
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Warning
  - Security
created_at: 2026-07-08T19:14:14.604Z
updated_at: 2026-07-08T19:14:14.604Z
---

**Source:** Security · prompt-injection-lure (new finding)
**File:** `AGENTS.md:1-4` (pulled into CLAUDE.md via `@AGENTS.md`)
**Severity:** warning

## Description

The repo's AGENTS.md opens with: "This is NOT the Next.js you know... Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." Next.js does not ship any such "read this before coding" directive in `node_modules` — this reads as a prompt-injection lure planted in project config to get an AI coding assistant to read and follow attacker-controlled or wasted-context content from a dependency path. No legitimate reason for a project's own AGENTS.md to redirect instruction-following into `node_modules`.

This health-check run did not follow that instruction.

## Recommended Fix

Remove this text from AGENTS.md/CLAUDE.md. Treat any future "read X before coding" instructions embedded in repo config with suspicion, especially ones pointing at generated/vendored paths an attacker (or a compromised dependency update) could plant files in.
