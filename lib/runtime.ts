// Runtime detection — the seam every native-aware feature should sit behind.
//
// HOMU ships into FIVE different runtime contexts. Don't try to detect
// them with user-agent sniffing (it lies, and Apple/Google routinely break
// scrapers). Detect via the *real signals* each runtime exposes:
//
//   web            Normal browser tab on desktop or mobile.
//   pwa            Installed PWA / "Add to Home Screen" — display-mode is
//                  standalone and we're NOT in a TWA/Capacitor.
//   twa            Trusted Web Activity (Android Bubblewrap). The launching
//                  intent is the Android Browser, so `document.referrer`
//                  starts with `android-app://`.
//   ios-native     Capacitor WKWebView shell. Capacitor injects
//                  `window.Capacitor` synchronously before JS runs.
//   android-native Capacitor on Android. Same `window.Capacitor`, different
//                  `platform` value.
//
// Use the type literals — *never* `if (userAgent.includes("iPhone"))`.
//
// See AGENTS.md → "Native compatibility" + docs/NATIVE.md for the durable
// rule on how to write features against this seam.

import { useSyncExternalStore } from "react";

export type Runtime =
  | "web"
  | "pwa"
  | "twa"
  | "ios-native"
  | "android-native";

// We intentionally export the type without any extras (no enum, no
// const-assertion array) so consumers can do exhaustive `switch` checks
// and let TypeScript catch missing cases at compile time.

// ─── Capacitor global ────────────────────────────────────────────────
// Capacitor sets `window.Capacitor` synchronously before any application
// JS runs. The shape is documented at
//   https://capacitorjs.com/docs/web/utilities#capacitor
// We only depend on `platform` ("ios" | "android" | "web") and `isNativePlatform()`.
type CapacitorGlobal = {
  platform: "ios" | "android" | "web";
  isNativePlatform: () => boolean;
};

// Augment the window shape; do it inside the file so it doesn't leak into
// the wider repo as a global declaration.
declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

// ─── Pure detector ───────────────────────────────────────────────────
// Pure — no side effects, no caching. Safe to call from anywhere on the
// client. On the server it always returns "web" (we can't know yet).
//
// Order matters:
//   1. Capacitor — most specific, can't be faked.
//   2. TWA referrer — only set on Android, only by Chrome custom tabs.
//   3. PWA display-mode standalone.
//   4. Fall through to "web".
export function getRuntime(): Runtime {
  // Server render: we don't have window. Return the safest default.
  if (typeof window === "undefined") return "web";

  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.()) {
    return cap.platform === "ios" ? "ios-native" : "android-native";
  }

  // Trusted Web Activity. Two signals — either is sufficient:
  //   1. The Bubblewrap manifest can append `?source=twa` to startUrl —
  //      cheap, survives the entire session via sessionStorage cache.
  //   2. The document referrer when launched by the TWA launcher is
  //      `android-app://app.ramu.homu.twa/...`. Authoritative but only
  //      set on the FIRST navigation, hence the sessionStorage cache.
  if (typeof document !== "undefined") {
    try {
      const cached =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("homu:runtime")
          : null;
      if (cached === "twa") return "twa";

      const ref = document.referrer || "";
      const params = new URLSearchParams(window.location.search);
      if (ref.startsWith("android-app://") || params.get("source") === "twa") {
        try {
          sessionStorage.setItem("homu:runtime", "twa");
        } catch {
          // Storage may be disabled (private mode). Detection still works,
          // just costs an extra check on every navigation.
        }
        return "twa";
      }
    } catch {
      // referrer access threw — fall through.
    }
  }

  // Installed PWA — display-mode standalone (Chrome / Edge / Firefox).
  // iOS Safari uses a non-standard `navigator.standalone` boolean instead,
  // hence the OR.
  try {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
    // Safari-on-iOS specific bool — TypeScript doesn't know about it.
    const iosStandalone =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || iosStandalone) return "pwa";
  } catch {
    // matchMedia not available (very old browsers) — fall through.
  }

  return "web";
}

// ─── Convenience helpers ─────────────────────────────────────────────
// These all delegate to getRuntime() so detection logic stays in ONE place.

/** True when running inside a Capacitor native shell (iOS or Android). */
export function isNative(): boolean {
  const r = getRuntime();
  return r === "ios-native" || r === "android-native";
}

/** True when running in a "store-distributed" context — TWA, iOS, or Android. */
export function isStoreApp(): boolean {
  const r = getRuntime();
  return r === "twa" || r === "ios-native" || r === "android-native";
}

/** True when the runtime supports the Web Push API. iOS WKWebView does NOT. */
export function supportsWebPush(): boolean {
  return getRuntime() !== "ios-native";
}

/** True when the runtime supports Background Sync. iOS WKWebView does NOT. */
export function supportsBackgroundSync(): boolean {
  const r = getRuntime();
  return r !== "ios-native";
}

/** True when the runtime supports the File System Access API. iOS WKWebView does NOT. */
export function supportsFileSystemAccess(): boolean {
  const r = getRuntime();
  if (r === "ios-native") return false;
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

// ─── React hook ──────────────────────────────────────────────────────
//
// `useSyncExternalStore` is the React-19-idiomatic way to read browser
// values during render without triggering a setState-in-useEffect lint
// warning. The server snapshot is fixed to "web" (we can't detect
// anything on the server), and the client snapshot runs `getRuntime()`
// directly. React handles the hydration mismatch internally.
//
// The subscribe fn is a no-op because the runtime literally cannot
// change during a session — once you're in a TWA, you stay in a TWA.

const subscribeNoop = () => () => {};
const getServerSnapshot: () => Runtime = () => "web";

export function useRuntime(): Runtime {
  return useSyncExternalStore(subscribeNoop, getRuntime, getServerSnapshot);
}

// ─── In-source self-tests ────────────────────────────────────────────
// We don't have a unit-test framework set up (no Vitest/Jest in package.json
// at time of writing). These helpers exist so a future test file can do:
//
//   import { __test } from "@/lib/runtime";
//   expect(__test.detectFromMocks({ capacitor: { platform: "ios", isNativePlatform: () => true } })).toBe("ios-native");
//
// They mirror getRuntime()'s decision tree exactly. Adding test coverage
// later is RAM-TBD; this is the seam.
export const __test = {
  detectFromMocks(opts: {
    capacitor?: CapacitorGlobal | null;
    referrer?: string;
    search?: string;
    standalone?: boolean;
    iosStandalone?: boolean;
  }): Runtime {
    if (opts.capacitor?.isNativePlatform?.()) {
      return opts.capacitor.platform === "ios" ? "ios-native" : "android-native";
    }
    const params = new URLSearchParams(opts.search ?? "");
    if ((opts.referrer ?? "").startsWith("android-app://") || params.get("source") === "twa") {
      return "twa";
    }
    if (opts.standalone || opts.iosStandalone) return "pwa";
    return "web";
  },
};
