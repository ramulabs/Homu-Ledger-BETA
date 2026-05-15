#!/usr/bin/env bash
# Assemble HOMU codebase into a single markdown bundle for Claude design.
set -euo pipefail

cd "$(dirname "$0")"
OUT="HOMU-codebase-bundle.md"

# Ordered file groups (most design-relevant first).
GROUPS_UI_STYLE=(
  "app/globals.css"
  "lib/design-tokens.ts"
  "lib/cn.ts"
  "postcss.config.mjs"
)

# Collect files by group with globbing.
collect() {
  local pattern="$1"
  find $pattern -type f 2>/dev/null | sort
}

UI_PAGES=$(collect "app")
COMPONENTS=$(collect "components")
LIB=$(collect "lib")
SUPABASE=$(collect "supabase/migrations")
CONFIG_FILES=("package.json" "next.config.ts" "tsconfig.json" "middleware.ts" "vercel.json" "eslint.config.mjs" "README.md" "AGENTS.md" "CLAUDE.md" "CHANGELOG.md" "public/sw.js")

# Language fences.
fence_for() {
  case "$1" in
    *.ts|*.tsx) echo "tsx" ;;
    *.js|*.mjs) echo "js" ;;
    *.css) echo "css" ;;
    *.json) echo "json" ;;
    *.sql) echo "sql" ;;
    *.md) echo "md" ;;
    *) echo "" ;;
  esac
}

emit_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  local fence
  fence=$(fence_for "$f")
  {
    printf "\n\n### \`%s\`\n\n" "$f"
    printf '```%s\n' "$fence"
    cat "$f"
    printf '\n```\n'
  } >> "$OUT"
}

# Reset output.
: > "$OUT"

cat >> "$OUT" <<'HEADER'
# HOMU — Codebase Bundle for Design

This is the full source of **HOMU Ledger** (Next.js 15 + Supabase + Tailwind), packaged as a single document so you can read it end-to-end and propose visual changes or new features.

## How to use this bundle

1. **Skim the file tree** below to get oriented.
2. **Design-relevant files come first**: global styles, design tokens, UI primitives, then pages/components, then data layer.
3. When proposing changes, reference files by their path (e.g. `components/balance-card.tsx`) and show the diff or the full replacement file in a fenced code block.
4. The app is a mobile-first PWA. Bottom-nav layout, sheet-based modals, tap targets ≥ 44px.
5. Existing design system lives in `lib/design-tokens.ts` + `app/globals.css` + `components/ui/*`. Prefer extending it over inventing new tokens.

---

## File tree

```
HEADER

# File tree (excluding node_modules, .next, lockfiles).
{
  find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.mjs" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.sql" \) \
    -not -path "./node_modules/*" \
    -not -path "./.next/*" \
    -not -name "package-lock.json" \
    -not -name "tsconfig.tsbuildinfo" \
    -not -name "next-env.d.ts" \
    -not -name ".build-bundle.sh" \
    -not -name "HOMU-codebase-bundle.md" \
    | sort | sed 's|^\./||'
} >> "$OUT"

printf '```\n\n---\n\n' >> "$OUT"

section() {
  printf '\n## %s\n' "$1" >> "$OUT"
}

section "Design tokens & global styles"
for f in "${GROUPS_UI_STYLE[@]}"; do emit_file "$f"; done

section "UI primitives (components/ui)"
for f in $(find components/ui -type f | sort); do emit_file "$f"; done

section "Layouts & shell"
for f in app/layout.tsx app/page.tsx "app/(app)/layout.tsx" "app/(auth)/layout.tsx" app/auth/layout.tsx; do emit_file "$f"; done

section "Pages — app (authenticated)"
for f in $(find "app/(app)" -type f | sort); do
  case "$f" in
    "app/(app)/layout.tsx") ;;
    *) emit_file "$f" ;;
  esac
done

section "Pages — auth & onboarding"
for f in $(find "app/(auth)" app/auth app/onboarding app/privacy -type f 2>/dev/null | sort); do
  case "$f" in
    "app/(auth)/layout.tsx"|"app/auth/layout.tsx") ;;
    *) emit_file "$f" ;;
  esac
done

section "Components (feature-level)"
for f in $(find components -maxdepth 1 -type f | sort); do emit_file "$f"; done

section "Server actions"
for f in $(find app/actions -type f | sort); do emit_file "$f"; done

section "API routes"
for f in $(find app/api -type f | sort); do emit_file "$f"; done

section "Library code"
for f in $(find lib -type f | sort); do
  case "$f" in
    "lib/design-tokens.ts"|"lib/cn.ts") ;; # already emitted up top
    *) emit_file "$f" ;;
  esac
done

section "Database (Supabase migrations)"
for f in $(find supabase/migrations -type f | sort); do emit_file "$f"; done

section "Configuration & docs"
for f in "${CONFIG_FILES[@]}"; do emit_file "$f"; done

# Footer stats.
LINES=$(wc -l < "$OUT")
BYTES=$(wc -c < "$OUT")
APPROX_TOK=$(( BYTES / 4 ))
cat >> "$OUT" <<EOF

---

_Bundle generated $(date '+%Y-%m-%d %H:%M %Z') — ${LINES} lines, ${BYTES} bytes, ~${APPROX_TOK} tokens (rough estimate at 4 chars/token)._
EOF

echo "Wrote $OUT"
ls -lh "$OUT"
