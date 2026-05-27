// Runtime detection — which shell is the app running inside?
//
// Why this exists (RAM-9, 2026-05-27)
// ────────────────────────────────────
// HOMU ships across three runtimes today, and a fourth (real native iOS)
// is on the roadmap. Most features don't care about the distinction —
// they render the same React tree everywhere. But push notifications
// are the exception: Apple does not expose Web Push to WKWebView, so
// the Settings → Notifications opt-in toggle would prompt-then-fail on
// iOS Capacitor. Better to detect the runtime client-side and show a
// "iOS native push coming soon" notice instead.
//
// Runtimes
// ────────
//   web              — desktop / mobile browser (no install)
//   pwa              — installed PWA (display-mode: standalone, including
//                      "Add to Home Screen" on iOS Safari)
//   android-twa      — Android Trusted Web Activity. Detected via
//                      `document.referrer === 'android-app://...'`.
//   ios-native       — iOS Capacitor / WKWebView shell. Detected via
//                      `window.Capacitor` (the Capacitor runtime injects
//                      it before the first paint).
//
// All checks are client-side. Calling from the server returns 'web'
// because we never know the runtime at render time — the right pattern
// is to dynamic-import this and call it in `useEffect` (or render the
// gated UI conditionally after mount).

export type HomuRuntime = "web" | "pwa" | "android-twa" | "ios-native";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export function getRuntime(): HomuRuntime {
  if (typeof window === "undefined") return "web";

  // 1. Native shells first. Capacitor sets `window.Capacitor.isNativePlatform()`
  //    on both iOS and Android; for now HOMU only ships an iOS shell so we
  //    label it `ios-native` outright. When we add an Android Capacitor
  //    build we'll branch on `getPlatform()`.
  if (window.Capacitor?.isNativePlatform?.()) {
    return "ios-native";
  }

  // 2. Android Trusted Web Activity. Chrome sets the referrer to
  //    `android-app://<package>` when the document is launched from the
  //    associated TWA shell. The shell uses Chrome under the hood so Web
  //    Push works exactly as in a browser tab.
  if (typeof document !== "undefined" && document.referrer.startsWith("android-app://")) {
    return "android-twa";
  }

  // 3. Installed PWA — installed Add-to-Home-Screen apps render in their
  //    own standalone window. Includes iOS Safari's standalone mode (the
  //    A2HS path) which is what most iPhone users have today; that mode
  //    is still WKWebView underneath but does NOT expose Capacitor's
  //    bridge — and importantly, since iOS 16.4 (March 2023) it CAN show
  //    Web Push notifications. So we treat it as `pwa`, not `ios-native`.
  if (window.matchMedia?.("(display-mode: standalone)").matches) {
    return "pwa";
  }
  // iOS Safari (older) reports standalone via this proprietary flag.
  // (typed loosely — Apple's typing for `navigator.standalone` is
  //  `unknown` until you opt into webkit-dom.d.ts).
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return "pwa";
  }

  return "web";
}

/**
 * True only when we're inside the iOS Capacitor shell. Use this to gate
 * Web Push opt-in (it would silently fail on iOS WKWebView).
 *
 * Returns false on the server — caller should treat that the same as
 * "unknown, render the cautious branch later". For the Settings page
 * we render the toggle initially and swap to the gated copy in a
 * useEffect once the runtime is known. See SettingsPushSubscribeForm.
 */
export function isIosNative(): boolean {
  return getRuntime() === "ios-native";
}

/**
 * True for any native shell. Today that's only `ios-native`; an Android
 * Capacitor shell would be added here too. Used by code that doesn't
 * care which native it is, only whether the runtime is one (e.g. for
 * deciding whether to render the deep-link install banner).
 */
export function isNative(): boolean {
  const r = getRuntime();
  return r === "ios-native";
}
