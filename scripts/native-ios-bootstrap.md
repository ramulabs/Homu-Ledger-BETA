# iOS native shell — bootstrap (Capacitor)

This document is the **human-driven** part of taking HOMU Ledger to the App
Store. The Capacitor JS config and the `ios/` Xcode project are already
committed (see `capacitor.config.ts` and `ios/App/`). What follows is what a
developer on a Mac with **full Xcode** has to do to actually build, sign, and
ship the app.

> If you only have Command Line Tools installed (not full Xcode), you cannot
> open `.xcodeproj` files or build for device. Install Xcode first:
> `xcode-select --install` is **not** enough — get Xcode from the App Store.

---

## 0. Prerequisites — one-time

```bash
# Full Xcode (15+) from the Mac App Store, then:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version            # must print "Xcode 15.x" or higher
xcrun simctl list devices      # sanity-check the iOS simulator is there
```

You also need:

- An Apple ID enrolled in the **Apple Developer Program** ($99/yr).
- A signing certificate + provisioning profile for `app.ramu.homu` in
  App Store Connect. Xcode's "Signing & Capabilities" tab can fetch these
  automatically once you sign in with the team's Apple ID.

Capacitor 8 uses **Swift Package Manager** (not CocoaPods), so you do *not*
need to install `pod`. If you see `pod install` mentioned anywhere it's
out-of-date documentation.

---

## 1. Verify the Capacitor scaffold

From the repo root:

```bash
npm ci                         # installs @capacitor/{core,cli,ios} from package.json
npx cap --version              # expect 8.3.x
npx cap doctor ios             # sanity-checks the ios/ project
```

If `cap doctor` complains the `ios/` project is missing (e.g. you cloned
fresh and the OS-level `.gitignore` skipped some files), regenerate it:

```bash
rm -rf ios
npx cap add ios
npx cap sync ios
```

`npx cap sync` is what wires up plugin code from `node_modules` into the
Xcode project. Run it any time you add a Capacitor plugin (e.g.
`@capacitor/push-notifications` for RAM-9 follow-up).

---

## 2. Configure signing in Xcode

```bash
npx cap open ios               # opens ios/App/App.xcworkspace in Xcode
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities** tab.
2. Tick **Automatically manage signing**, pick the "Ramulabs" team.
3. Bundle Identifier must read `app.ramu.homu` (already set in
   `capacitor.config.ts`).
4. Add the **Associated Domains** capability and the entry
   `applinks:homu.ramu.app`. Xcode generates `ios/App/App/App.entitlements`;
   commit that file.
5. (Optional, push-notif follow-up) Add **Push Notifications** capability
   when RAM-9-iOS lands.

---

## 3. Apple App Site Association — universal links

The OS will only honour `applinks:homu.ramu.app` if Apple's CDN can fetch
the apple-app-site-association file from the host. We ship one at
`public/.well-known/apple-app-site-association` (committed in this PR);
Vercel serves it with the correct `application/json` content type.

After your *first* TestFlight build, verify it:

```bash
curl -sI https://homu.ramu.app/.well-known/apple-app-site-association | head
# expect 200, content-type: application/json
curl -s  https://app-site-association.cdn-apple.com/a/v1/homu.ramu.app | jq
# expect Apple's CDN to mirror the same JSON within ~24h
```

The TeamID inside the JSON must match what Xcode shows on the Signing tab.
**Today the file has a `XXXXXXXXXX` placeholder TeamID** — fill it in.

---

## 4. App icons + splash

The PWA already ships icons at:

- `public/icons/icon-512.png` (square)
- `public/icons/icon-maskable-512.png` (safe area for round masks)
- `public/icons/apple-touch-icon.png`

iOS wants every size from 20×20 (notifications) up to 1024×1024 (App Store).
The easiest path is `@capacitor/assets`:

```bash
npm i -D @capacitor/assets

# put a 1024×1024 PNG (no transparency, solid background) at:
mkdir -p resources
cp <your-source-logo>.png resources/icon-only.png

# optionally a splash background at resources/splash.png (2732×2732)

npx capacitor-assets generate --ios
```

This rewrites `ios/App/App/Assets.xcassets/AppIcon.appiconset/*` for you.
**Do not** commit the auto-generated icon set without reviewing the
1024×1024 master in `resources/` — Apple rejects icons with transparency
or rounded corners pre-applied.

---

## 5. Build + run on simulator

```bash
npx cap copy ios               # copy capacitor.config.ts → ios/App/App/capacitor.config.json
npx cap open ios               # launch Xcode
# In Xcode: Product → Run (⌘R) with an iPhone simulator selected
```

The webview should load `https://homu.ramu.app` directly (see the `server.url`
in `capacitor.config.ts`). If you see a blank white screen, check the device
console for ATS errors — usually means a referenced sub-resource is over
`http:` and got blocked.

---

## 6. Archive + upload to TestFlight

```bash
# In Xcode: Product → Archive
# When the Organizer opens, click "Distribute App" → "App Store Connect"
# → "Upload". Use automatic signing.
```

Or from the command line (CI):

```bash
xcodebuild -workspace ios/App/App.xcworkspace \
           -scheme App \
           -configuration Release \
           -archivePath build/HOMU.xcarchive \
           archive

xcodebuild -exportArchive \
           -archivePath build/HOMU.xcarchive \
           -exportPath build/ipa \
           -exportOptionsPlist scripts/export-options-app-store.plist
```

(You'll need to author `scripts/export-options-app-store.plist` once — keep
it out of source control if it includes the team ID + provisioning UUID;
otherwise commit a scrubbed template.)

---

## 7. App Store Connect metadata

Use the bilingual drafts in `docs/store-listings/apple-app-store/`:

- `listing.en.md` — primary locale (English (U.S.))
- `listing.id.md` — Bahasa Indonesia locale (add via
  App Store Connect → Localizations → Indonesian)

Paste each field into App Store Connect. Screenshot sizes per device class
are listed at the top of each markdown file.

---

## 8. Common failure modes

| Symptom                                              | Likely cause                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `xcodebuild` says "Unable to locate Xcode"           | You only have Command Line Tools. Install Xcode and rerun `xcode-select -s`.                    |
| Webview shows a blank white screen on launch         | `server.url` host doesn't have valid TLS; ATS blocked it. Verify TLS, no mixed-content.         |
| Tap on https://homu.ramu.app/* opens Safari, not app | Universal Links broken — see step 3, the apple-app-site-association file isn't being served.    |
| App Store review rejects as "thin webview wrapper"   | Apple guideline 4.2 — add at least one platform feature (haptics / share / status-bar / push).  |
| Push notifications silently no-op                    | iOS doesn't support Web Push; use `@capacitor/push-notifications` (APNs). Tracked in RAM-9-iOS. |
