import type { CapacitorConfig } from "@capacitor/cli";

// ─────────────────────────────────────────────────────────────────────────────
// HOMU Ledger — Capacitor configuration
//
// Strategy: HOSTED-URL with offline fallback (option ii in RAM-13 SKILL.md).
//
// Why not `output: 'export'` (option i)?
// ─ HOMU relies on:
//     - Next.js Server Actions ("use server" — see app/actions/*.ts)
//     - Supabase auth via middleware.ts (cookies + redirects)
//     - Dynamic route handlers under app/api/*
//     - next/headers + cookies()
//   All four are unsupported in `output: 'export'` per
//   node_modules/next/dist/docs/01-app/02-guides/static-exports.md.
//   A static export would force re-architecting the entire data layer.
//
// What this means at runtime:
// ─ The iOS shell wraps WKWebView and loads https://homu.ramu.app/* directly.
// ─ Capacitor still bundles a minimal index.html splash inside `public/` so
//   first launch has *something* to render before WKWebView reaches the server.
// ─ The Next.js service worker (public/sw.js) keeps caching navigation HTML
//   so the app survives temporary offline.
// ─ Universal links: HOMU paths under https://homu.ramu.app/* open in the app.
//
// Future: if/when we have features that MUST run offline (e.g. a fully local
// transaction log with Background Sync), we can flip individual routes to
// SSG and bundle them via cap. For now: hosted is the right call.
// ─────────────────────────────────────────────────────────────────────────────

const config: CapacitorConfig = {
  appId: "app.ramu.homu",
  appName: "HOMU Ledger",
  // `webDir` points at the local fallback shell that ships *inside* the
  // iOS/Android bundle. WKWebView shows it for the split-second before the
  // remote URL loads, and also when the device is fully offline on first run.
  // It must contain an index.html — see scripts/native-ios-bootstrap.md for
  // how to generate one.
  webDir: "public",
  // The actual app is hosted. WKWebView navigates here on launch.
  // We keep cleartext off (iOS rejects insecure origins anyway).
  server: {
    url: "https://homu.ramu.app",
    cleartext: false,
    // Allow webview navigation to the production host. Wildcard subdomains
    // included so Supabase auth callbacks and Vercel preview URLs (during
    // dev) don't get blocked.
    allowNavigation: [
      "homu.ramu.app",
      "*.ramu.app",
      "*.supabase.co",
      "*.vercel.app",
    ],
  },
  ios: {
    // Use the system content-inset behaviour so safe-area insets work.
    contentInset: "automatic",
    // Match the PWA theme color (#f6f1e9 — see public/manifest.webmanifest).
    backgroundColor: "#f6f1e9",
    // We want the URL bar gone (TWA-style chrome-less). WKWebView default.
  },
  android: {
    // Android side is shipped as a TWA via Bubblewrap, NOT Capacitor —
    // see android/twa-manifest.json and scripts/native-android-bootstrap.md.
    // This block exists in case a future contributor runs `npx cap add android`;
    // it points at the same hosted URL strategy.
    backgroundColor: "#f6f1e9",
    allowMixedContent: false,
  },
  plugins: {
    // Splash screen tuning. The actual splash image is generated via
    // `npx capacitor-assets generate` once the source 1024×1024 logo is
    // committed under resources/ — see scripts/native-ios-bootstrap.md.
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#f6f1e9",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    // Status bar — match light theme. The iOS native shell flips between
    // light/dark per system; the JS bridge re-syncs whenever the user
    // toggles theme inside the app (see components/theme-provider).
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#f6f1e9",
    },
  },
};

export default config;
