# Homu (Homu-Ledger-BETA) — Handover

_Written 2026-10-18 for the move to a new Claude account. Infra accounts (GitHub `ramulabs`, Vercel team `ramulabs`, Supabase org, Cloudflare) are unchanged — only the Claude account is moving. Account-level items are in the separate `ACCOUNT-HANDOVER.md`, which is not committed._

## What it is

A family/personal finance ledger PWA built with Next.js 16, Tailwind 4 and Supabase. It covers shared ledgers, wallets, recurring items, reports, voice add, a pending-transactions inbox, and an MCP server so AI assistants can suggest transactions. **This is the most active and only fully-live product.**

> `AGENTS.md`: this Next.js version has breaking changes. Read `node_modules/next/dist/docs/` before writing code.

## Live / infra

| Thing | Value |
|---|---|
| App | https://homu.ramu.app |
| Vercel | team `ramulabs`, project `familyledger` (`prj_zVtfn5vR25wMawQYVZfGc7d2oQlN`), region `hnd1` |
| Supabase | "Family Finance Tracker Project", ref `qunbbkptumtzgzzwnszy`, ap-northeast-1 — **ACTIVE** |
| Email ingest | Cloudflare Worker `cloudflare/inbox-email-worker` → `/api/inbox/email` (HMAC) |
| Version | `1.48.3` (2026-10-08) |

## Release discipline (don't skip)

Every production release gets an entry in **both** `CHANGELOG.md` and `lib/changelog.ts` (the in-app Settings → Updates) before deploy, plus a `package.json` version bump. Migrations are numbered `supabase/migrations/NNNN_*.sql`; the latest is `0036_move_transaction_remap.sql`.

## Current state (as of 2026-10-18)

- **Recent:** v1.47.0 MCP server · v1.48.0 Pending transactions · v1.48.1 agent daily cap (50/day) · v1.48.2 inbox endpoints excluded from middleware · v1.48.3 move-to-ledger fix, form-reset fix, perf, dark mode.
- **In progress:** RAM-22 redesign "New category" UI in Add Transaction · RAM-23 sheet dismisses after creating a category. Note: v1.48.3 fixed the form *wipe*, so check whether RAM-23 is now done.
- **Planned:** RAM-21 keyboard issues on Add Transaction · RAM-24 category rows clip long names.
- **Backlog:** RAM-5 budgets · RAM-6 receipt OCR · RAM-7 settle-up · RAM-8 recurring controls · RAM-9 push notifications · RAM-10 CSV/PDF export · RAM-11 voice queries · RAM-12 reports depth · RAM-13 app-store release · RAM-14 free vs premium · RAM-15 hide totals · RAM-16 hide user icon when single member · RAM-17 calendar "On date" bug · RAM-20 privacy policy + consent.
- **Security backlog: 13 open `health-security-*` findings. Treat these as priority.** Pattern: server actions that update or delete by ID without a household-ownership check (wallets, categories, recurring items, invitations). Also: feedback actions with no auth or role check · unauthenticated POST on `auth-log` · raw cursor params interpolated into a PostgREST filter. See `.forge/tasks/health-security-*.md`.
- `.forge/state.md` is still the onboarding stub from 2026-05-19 (claims v1.46.3) and is stale.

### ⚠️ PR clutter

There are ~30 open draft PRs (`#160`–`#196`, `chore(forge): deep health-check …`) left by the health-check routine. They are duplicates; close them in bulk.

## Working in this repo

- `npm install` · `npm run dev` (port 3000) · `npm run lint` · `npm run build` · `npx tsc --noEmit`.
- `git config core.hooksPath .githooks` enables the pre-push `tsc` check against committed code.
- `.claude/settings.json` deliberately **denies** direct pushes to `main`, force pushes, `supabase` / `vercel` CLIs, and Supabase MCP writes (migrations, SQL). Migrations are applied by the owner. Don't loosen this without asking.
- Hooks call the `forge` CLI (`session-start`, `context`, `heartbeat`, `sync`). They no-op if `@ramulabs/forge-cli` isn't installed.
- `.mcp.json` expects `VERCEL_TOKEN` and `SUPABASE_ACCESS_TOKEN` env vars for the project MCP servers.
- `.build-bundle.sh` regenerates `HOMU-codebase-bundle.md` for Claude Design hand-offs.

## Secrets (names only)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HOMU_WEBHOOK_URL`, `HOMU_WEBHOOK_SECRET`, `NEXT_PUBLIC_SW_KILL` (Vercel). Cloudflare Worker secrets live in `wrangler` / the Cloudflare dashboard. Users' MCP API keys are per-user, in the DB.

## First steps on the new account

1. Reconnect the GitHub, Vercel, Supabase and Cloudflare connectors. Cloudflare currently needs re-auth even on the old account.
2. Close the stale health-check PRs.
3. Fix the 13 security findings (ownership checks), then pick up RAM-21 to RAM-24.
4. Any Claude client connected to Homu's MCP server through the **old** account (e.g. a claude.ai custom connector) must be re-added on the new account.
