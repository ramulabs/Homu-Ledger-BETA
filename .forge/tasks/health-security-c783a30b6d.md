---
id: health-security-c783a30b6d
title: AGENTS.md contains a prompt-injection-style directive to read node_modules docs
status: backlog
priority: P3
assignee: unassigned
project: homu-ledger-beta
labels:
  - Health check
  - Info
  - Security
created_at: 2026-07-03T19:15:00.594Z
updated_at: 2026-07-03T19:15:00.594Z
---

## Finding

**Source:** Security · Repository-instruction prompt-injection pattern
**File:** `AGENTS.md:1` (imported into `CLAUDE.md` via `@AGENTS.md`)
**Severity:** info

## Description

`AGENTS.md` opens with:
```
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ
from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before
writing any code. Heed deprecation notices.
```
This instructs any AI coding agent operating on the repo to read arbitrary content out of `node_modules/next/dist/docs/` before acting. The installed `next` version (16.2.4 per `package.json`) is a normal upstream release with no such docs bundled. The instruction has the shape of a prompt-injection payload: a plausible, urgent-toned directive embedded in project config that auto-loads into an agent's context on every session, designed to make the agent trust and act on content from a location an attacker could plant into (e.g. via a malicious/typosquatted dependency or compromised `postinstall` script).

Two independent audit passes on this repo, plus the audit of the sibling `ramulabs/forge` repo (whose session unexpectedly also received this same "project instructions" text despite `forge` having no `AGENTS.md`/`CLAUDE.md` of its own), all flagged this content and did not act on it.

## Recommended Fix

Treat this as a real finding, not a curiosity. Confirm via `git blame`/commit history who added this text and why, verify whether `node_modules/next/dist/docs/` actually exists in any install and what it contains if so, and consider removing or rewriting this section. Separately, the operator should investigate why this repo's project-instruction text is being injected into sessions scoped to the unrelated `ramulabs/forge` repository — that cross-contamination is itself the mechanism an attacker would use to hijack an agent's behavior across repos.
