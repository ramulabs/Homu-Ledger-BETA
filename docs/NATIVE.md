# HOMU Ledger — Native runtime compatibility

This is the long-form companion to the "Native compatibility" rule in
`AGENTS.md`. Read this when you're about to add a new feature, or when
you're reviewing someone else's PR that touches a Web API.

## The three runtimes HOMU targets

HOMU is one codebase that ships through **three** delivery channels:

| Runtime         | What it is                                       | Distribution                                | Where it lives                            |
| --------------- | ------------------------------------------------ | ------------------------------------------- | ----------------------------------------- |
| **PWA**         | The web app at https://homu.ramu.app             | Direct URL + Vercel hosting                 | `next dev` / `next build` — this repo     |
| **Android TWA** | Trusted Web Activity wrapping the PWA            | Google Play Store                           | `android/twa-manifest.json` (Bubblewrap)  |
| **iOS native**  | Capacitor WKWebView shell loading the hosted PWA | Apple App Store                             | `capacitor.config.ts` + `ios/` (Xcode)    |

> The PWA *is* what runs inside the TWA and the iOS shell. Both store apps
> are thin wrappers that point at `https://homu.ramu.app` (see the
> `server.url` in `capacitor.config.ts` and the `host` in
> `android/twa-manifest.json`). This means **every web change ships to all
> three at once** — there's no extra build step for app-store releases
> unless we change the wrapper itself (icons, splash, manifest).

There are also two non-store contexts to keep in mind:

- **Regular web** — desktop browser tab. Same code as the PWA but no
  service worker activation. Voice + AI work fine.
- **Installed PWA on desktop** — Chrome / Edge let users "Install" the PWA
  to a chromeless window. Behaves like the mobile PWA.

`lib/runtime.ts` distinguishes all five via `getRuntime()`. See its
JSDoc for detection mechanics.

## Web APIs and how they map across runtimes

Quick lookup. Refer to this *before* writing a feature that depends on any
browser API.

| Web API                              | PWA (web/installed) | TWA (Android) | iOS WKWebView | If broken: HOMU's fallback                             |
| ------------------------------------ | ------------------- | ------------- | ------------- | ------------------------------------------------------ |
| Cookies + localStorage + sessionStorage | ✅                | ✅            | ✅            | n/a                                                    |
| IndexedDB                            | ✅                  | ✅            | ✅            | n/a                                                    |
| `fetch` to same origin               | ✅                  | ✅            | ✅            | n/a                                                    |
| `fetch` to third-party origin (CORS) | ✅                  | ✅            | ✅            | n/a — Supabase, Groq, Gemini all CORS-friendly         |
| Service Worker — install + activate  | ✅                  | ✅            | ✅            | n/a                                                    |
| Service Worker — `fetch` interception | ✅                 | ✅            | ⚠️ partial    | Capacitor SW works for asset caching; navigation may bypass |
| Web Push API                         | ✅                  | ✅            | ❌            | Use `@capacitor/push-notifications` (APNs) on iOS      |
| `Notification.requestPermission`     | ✅                  | ✅            | ❌            | Same as above                                          |
| Background Sync                      | ✅ (Chrome only)    | ✅            | ❌            | Replay queue on next foreground; see `lib/sync-queue.ts` |
| Periodic Background Sync             | ✅ (Chrome only)    | ✅ (Chrome only) | ❌         | Schedule via a server-side cron + push                 |
| `navigator.mediaDevices.getUserMedia` (mic) | ✅           | ✅            | ✅            | Voice-to-add (`components/speak-to-add-fab.tsx`) works |
| `MediaRecorder`                      | ✅                  | ✅            | ✅ (mp4/aac)  | `lib/voice/mic-capture.ts` already negotiates the codec |
| Camera via `<input capture="environment">` | ✅            | ✅            | ✅            | Receipt photos in add-transaction-sheet work          |
| File System Access API (`showOpenFilePicker`) | ✅ (Chrome) | ✅ (Chrome)   | ❌            | Fall back to `<input type="file">`                     |
| `navigator.share` (Web Share)        | ✅                  | ✅            | ✅            | n/a                                                    |
| `navigator.clipboard.writeText`      | ✅                  | ✅            | ✅            | n/a — used by `components/copy-button.tsx`             |
| Web Bluetooth / Serial / USB         | ⚠️ Chrome only      | ⚠️ Chrome only | ❌           | Don't depend on these — HOMU has no use case today    |
| `display-mode: standalone` query     | ✅ (when installed) | ✅            | ⚠️ via Capacitor | Use `getRuntime()` instead                          |
| Apple Pay / Google Pay (web)         | ✅ where supported   | ✅            | ✅            | n/a today                                              |
| OAuth via Supabase                   | ✅                  | ⚠️ open in custom tab | ⚠️ open in Safari | Don't auto-redirect inside webview; pop external |

✅ = works ⚠️ = works with caveats, document the caveat ❌ = does not work, you must provide a non-web fallback

## Per-feature audit (current as of RAM-13)

These are HOMU's shipped features today. Each row says how the feature
behaves in each of the three runtimes, with a one-line gap noted in the
last column.

| Feature                                            | PWA | TWA | iOS native | Notes / gaps                                                                                          |
| -------------------------------------------------- | --- | --- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Auth — magic link + password                       | ✅  | ✅  | ⚠️         | Magic-link redirect opens Safari, then deep-links back. Universal Link must be configured (see scripts/native-ios-bootstrap.md step 3). |
| Auth — Supabase OAuth (Google)                     | ✅  | ⚠️  | ⚠️         | TWA: opens Chrome Custom Tab. iOS: opens Safari ASWebAuthSession. Both work but the back-button UX is different. |
| Transactions — add / list / edit / delete         | ✅  | ✅  | ✅         | Pure server actions + Supabase RLS. No native dependency.                                            |
| Categories — manage                                | ✅  | ✅  | ✅         | Same as transactions.                                                                                |
| Wallets — manage                                   | ✅  | ✅  | ✅         | Same.                                                                                                |
| Households — invite + accept                       | ✅  | ✅  | ✅         | Invitation URL works via universal link once configured (step 3).                                    |
| Receipt photo attachment                           | ✅  | ✅  | ✅         | `<input capture="environment">` — natively triggers camera on both platforms. Compressed client-side via `lib/compress-photo.ts`. |
| Voice-to-add transaction (Whisper)                 | ✅  | ✅  | ✅         | iOS Safari mic codec quirks handled in `lib/voice/mic-capture.ts`. Capacitor inherits the same WKWebView.                              |
| AI categorisation (Gemini)                         | ✅  | ✅  | ✅         | Pure server action; no native dependency.                                                            |
| Reports (Recharts SVG)                             | ✅  | ✅  | ✅         | Renders fine in WKWebView; no Canvas2D quirks.                                                       |
| Settings — devices / sessions                      | ✅  | ✅  | ✅         | UA parser handles iOS Safari + iOS Capacitor labels (`lib/user-agent.ts`).                            |
| Privacy / legal pages                              | ✅  | ✅  | ✅         | Excluded from universal-link interception (open in Safari) — see `public/.well-known/apple-app-site-association`. |
| Service worker — offline navigation cache          | ✅  | ✅  | ⚠️         | Works in WKWebView but iOS evicts SW caches aggressively under storage pressure. Don't promise long-term offline on iOS. |
| Sync queue (mutation replay)                       | ✅  | ✅  | ✅         | Pure IndexedDB + `fetch` retry. No native bits.                                                      |
| Add-to-home-screen banner                          | ✅  | n/a | n/a        | `components/add-to-homescreen-banner.tsx` — should be hidden when `isStoreApp()` returns true. **TODO: gate it.** |
| Push notifications (RAM-9 inbound)                 | ✅  | ✅  | ❌         | Use `@capacitor/push-notifications` for APNs on iOS. **Tracked in RAM-9 follow-up.** No iOS push today. |
| Background recurring-transaction reminders        | ⚠️  | ⚠️  | ❌         | Depends on Background Sync (no iOS support). Replay on next foreground. Acceptable.                  |

### Gaps to track explicitly

These have known issues and need their own tickets when they ship:

1. **Add-to-home-screen banner** must hide inside TWA / Capacitor — gate
   `components/add-to-homescreen-banner.tsx` on `isStoreApp() === false`.
   _(Trivial, lands in this PR follow-up.)_
2. **Push on iOS** needs the `@capacitor/push-notifications` plugin plus
   APNs setup. Out of scope for RAM-13; follow-up under RAM-9-iOS.
3. **OAuth redirect UX** on TWA + iOS — opens external chrome / safari.
   Acceptable for v1; reconsider if the back-arrow round-trip is jarring.

## Reviewer checklist — paste into every PR's body

When opening a PR that touches *any* user-facing feature, paste this and
fill it in:

```markdown
## Native compatibility

- PWA: ✅ / ⚠️ / ❌ — one-line reason
- Android TWA: ✅ / ⚠️ / ❌ — one-line reason
- iOS native (Capacitor WKWebView): ✅ / ⚠️ / ❌ — one-line reason

Web APIs touched: <list any new APIs from the table above>
Runtime gating: <`getRuntime() / isNative() / supportsWebPush()` calls added, or "n/a">
Manual verification done: <PWA on Chrome / Safari iOS / etc>
```

A reviewer who sees this section missing should comment "please add the
native compatibility check" and request changes.

## Why we don't just use user-agent sniffing

Three reasons:

1. **TWA's UA is identical to Chrome on Android.** There is no
   distinguishing UA token. The only signal is `document.referrer`
   starting with `android-app://` — which is exactly what
   `getRuntime()` checks.
2. **iOS WKWebView's UA is identical to Safari on iOS.** You cannot
   tell the difference except via `window.Capacitor` (or the absence
   of the navigation bar, which is not programmatically observable).
3. **UA strings drift.** Chrome's UA freeze is ongoing; we'd be
   chasing it forever. Capability detection + the runtime helper is
   stable.

If you find yourself writing `if (navigator.userAgent.includes(...))`
in a feature, stop and reach for `lib/runtime.ts` instead.
