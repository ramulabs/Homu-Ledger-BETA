<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Native compatibility (durable rule)

Every new feature must work — or have a defined fallback — when HOMU runs as:
- the PWA (today)
- a Google Play TWA (Bubblewrap)
- an iOS Capacitor / WKWebView app

Before opening a PR for any feature, check it against the three runtimes and add a "## Native compatibility" section to the PR body marking each ✅ / ⚠️ / ❌ with a one-line reason.

Web APIs that DO NOT work in iOS WKWebView (and need a native bridge or a different design):
- Web Push (use APNs on iOS — needs a native plugin)
- File System Access API
- Web Bluetooth, Web Serial, Web USB
- Background Sync, Periodic Background Sync

Use `getRuntime()` / `isNative()` from `lib/runtime.ts` to gate behavior. Don't sniff user-agent strings.

See `docs/NATIVE.md` for the per-feature audit and the reviewer checklist.
