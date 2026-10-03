import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/service-worker-registrar";
import SplashScreen from "@/components/splash-screen";

export const metadata: Metadata = {
  title: "Homu",
  description: "Shared expense tracker for couples & families",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Homu",
    startupImage: "/icons/icon-192.png",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  other: {
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e9" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1814" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  // viewport-fit=cover lets the page extend into the iPhone notch / home
  // indicator area. We then opt fixed UI back in via env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required on <html> because the theme
    // bootstrap script below writes `data-theme` to this element *before*
    // React hydrates. Without it React would warn on every page load that
    // server-rendered `<html>` (no data-theme) differs from the client.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        {/* Theme + design-system override bootstrap. Both run BEFORE first
            paint so there's no flash. Theme sets data-theme on <html> from
            localStorage. Design overrides (set via /design-system) write
            individual --token CSS variables onto <html>, scoped to the
            active theme's mode (light/dark).
            Uses next/script with strategy="beforeInteractive" — the
            Next.js 16 way to inject inline scripts that need to run before
            hydration without tripping the bare-<script>-in-React warning. */}
        {/* v1.36.0 — default to LIGHT mode for new users instead of
            following prefers-color-scheme. Most of our user research is
            on light-mode mock-ups; defaulting to dark caused contrast
            audit churn (see v1.36.0 button fix). Users who want dark
            can flip Settings → Theme and we honour that.  */}
        <Script id="homu-theme-bootstrap" strategy="beforeInteractive">{`try{
var t=localStorage.getItem('homu-theme');
if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}
var resolved=(t==='light'||t==='dark')?t:'light';
var raw=localStorage.getItem('homu-design-overrides');
if(raw){var o=JSON.parse(raw);for(var k in o){var parts=k.split(':');if(parts.length===2&&parts[1]===resolved){document.documentElement.style.setProperty(parts[0],o[k]);}}}
if(localStorage.getItem('homu-hide-amounts')!=='0'){document.documentElement.dataset.hideAmounts='1';}
}catch(e){}`}</Script>
        {/* v1.46.15 — boot guard. Runs before hydration, so it still works when
            the app's JS is what failed:
              - a stale/missing JS chunk (common right after a deploy on a
                flaky phone connection) reloads the page once, at most every
                30s, instead of leaving a dead screen;
              - if React still hasn't hydrated after 8s, a "Reload" pill
                appears so nobody has to force-close the app.
            ServiceWorkerRegistrar sets window.__homuHydrated and removes the
            pill once React mounts. */}
        <Script id="homu-boot-guard" strategy="beforeInteractive">{`(function(){try{
var K='homu-chunk-reload';
function chunkErr(m){return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(m||'');}
function reloadOnce(){try{var l=+sessionStorage.getItem(K)||0;if(Date.now()-l<30000)return;sessionStorage.setItem(K,String(Date.now()));}catch(e){}location.reload();}
window.addEventListener('error',function(e){if(chunkErr(e&&e.message))reloadOnce();});
window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;if(chunkErr(r&&(r.name+' '+r.message)))reloadOnce();});
setTimeout(function(){
if(window.__homuHydrated||document.getElementById('homu-watchdog'))return;
var id=(navigator.language||'').toLowerCase().indexOf('id')===0;
var d=document.createElement('div');d.id='homu-watchdog';
d.setAttribute('style','position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);z-index:10000;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:999px;background:var(--foreground,#2a2520);color:var(--background,#f6f1e9);font:500 14px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);white-space:nowrap');
var t=document.createElement('span');t.textContent=id?'Memuat lebih lama dari biasanya':'Taking longer than usual';
var b=document.createElement('button');b.textContent=id?'Muat ulang':'Reload';
b.setAttribute('style','border:0;border-radius:999px;padding:8px 14px;font:600 14px -apple-system,BlinkMacSystemFont,sans-serif;background:#EE6452;color:#fff');
b.onclick=function(){location.reload();};
d.appendChild(t);d.appendChild(b);document.body.appendChild(d);
},8000);
}catch(e){}})();`}</Script>
        <SplashScreen />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
