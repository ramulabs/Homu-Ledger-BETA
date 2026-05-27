# Android native shell — bootstrap (Bubblewrap / TWA)

This document is the **human-driven** part of taking HOMU Ledger to Google
Play. The TWA manifest is already committed at `android/twa-manifest.json`;
what follows is what a developer with the Android SDK + JDK 17 has to do
to actually generate the `.aab`, sign it, and ship it.

> If you don't have JDK 17 and the Android SDK on your machine, **stop now**
> and install them before continuing. Bubblewrap will refuse to run without
> both. See the prerequisites section.

---

## 0. Prerequisites — one-time

```bash
# JDK 17 (OpenJDK is fine — Bubblewrap explicitly wants 17, not 21+)
brew install openjdk@17
export JAVA_HOME="$(/usr/libexec/java_home -v17)"
java -version                  # must print "17.x"

# Android SDK — the easiest path is Android Studio:
# https://developer.android.com/studio (gets you sdkmanager + platform tools)
# Then expose:
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"

# Bubblewrap itself
npm i -g @bubblewrap/cli@latest
bubblewrap doctor              # should report all green
```

You also need:

- A **Google Play Console** developer account ($25 one-time).
- A **signing keystore** for the app. Bubblewrap can generate one for you
  the first time you run `init`, but for an app you intend to ship long-term
  you should generate it explicitly (see step 2) and back up the keystore
  file *and* its passphrase somewhere safe (1Password). **If you lose this
  keystore, you can never update the app on Play — you have to ship a new
  package.**

---

## 1. Bootstrap the Bubblewrap project

From the repo root:

```bash
mkdir -p android/twa-project
cd android/twa-project

bubblewrap init --manifest=../twa-manifest.json
```

Bubblewrap will:

- Read `android/twa-manifest.json` (the file you're seeing committed in this
  repo).
- Fetch the matching launcher icon / splash assets from `homu.ramu.app`.
- Generate a Gradle Android project under `android/twa-project/`.
- Prompt for keystore password / alias on first run (see step 2).

> The `android/twa-project/` directory is **gitignored** — see
> `.gitignore` at the repo root. Only `android/twa-manifest.json` is the
> source of truth in this repo.

---

## 2. Signing keystore — first time only

If Bubblewrap prompts for a keystore that doesn't exist yet:

```bash
keytool -genkeypair \
        -keystore android.keystore \
        -alias android \
        -keyalg RSA \
        -keysize 2048 \
        -validity 9125 \
        -storepass <REDACTED> \
        -keypass <REDACTED> \
        -dname "CN=Ramulabs, OU=HOMU, O=Ramulabs, L=Jakarta, ST=Jakarta, C=ID"

# Back up the keystore + both passwords IMMEDIATELY:
cp android.keystore ~/Documents/Backups/homu-android-keystore-$(date +%Y%m%d).keystore
```

**Commit the keystore to source control? NO.** It's listed in `.gitignore`
at the repo root. Treat it like a private key.

---

## 3. Fill in `/.well-known/assetlinks.json`

After the keystore exists, extract its SHA-256 fingerprint:

```bash
keytool -list -v -keystore android.keystore -alias android | grep SHA256
# Look for a line like:
#   SHA256: A1:B2:C3:D4:E5:F6:...
```

Copy that hex string (colons, uppercase) into the
`sha256_cert_fingerprints` array in `public/.well-known/assetlinks.json`,
replacing the placeholder `XX:XX:...` row.

Redeploy HOMU. Verify:

```bash
curl -s https://homu.ramu.app/.well-known/assetlinks.json | jq
#   should print the JSON with the real fingerprint, Content-Type: application/json
```

If the file is missing or wrong, the TWA still installs and runs, but
Chrome shows a "from homu.ramu.app" URL bar at the top — a thinly-veiled
"this is a webview" sign that Apple-style App Store reviewers also dislike
on Play.

---

## 4. Build the AAB

```bash
cd android/twa-project
bubblewrap build
```

This generates `app-release-signed.aab` (Android App Bundle — what Play
wants) and `app-release-signed.apk` (for sideload testing).

Sideload to a connected device:

```bash
adb install app-release-signed.apk
adb logcat | grep -i "TWA\|homu"
```

The first launch should open `https://homu.ramu.app/transactions` (the
`startUrl` from the manifest) inside a chromeless Chrome Custom Tab. If
you see the URL bar, the assetlinks.json isn't reachable / has the wrong
fingerprint.

---

## 5. Upload to Play Console

1. Sign in to <https://play.google.com/console>.
2. Create a new app — package name **must** be `app.ramu.homu.twa`
   (matches the manifest).
3. Internal testing track → Upload → drag `app-release-signed.aab`.
4. Use the bilingual store-listing copy under
   `docs/store-listings/google-play/`:
   - `listing.en.md` — primary listing
   - `listing.id.md` — Bahasa Indonesia localisation
5. Fill the data-safety form using the draft answers in `listing.en.md`.
6. Promote from Internal → Closed → Open → Production once stable.

---

## 6. Updating the TWA later

Bumping HOMU's version number on the web is *not* enough — the AAB has its
own `appVersionCode` / `appVersionName`. To ship an updated TWA:

1. Edit `android/twa-manifest.json` → bump `appVersionCode` (integer) and
   `appVersionName` (semver).
2. Commit + push.
3. Re-run `bubblewrap update` in `android/twa-project/` (it picks up the
   updated manifest).
4. Re-run `bubblewrap build`.
5. Upload the new AAB to Play.

The TWA itself just navigates to `https://homu.ramu.app/*`, so day-to-day
web releases are reflected immediately without a new Play submission. Only
ship a new AAB when you change something Play cares about — package name,
launch screen, app shortcuts, signed asset links, target SDK level.

---

## 7. Common failure modes

| Symptom                                                | Likely cause                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `bubblewrap doctor` complains about JDK                | `JAVA_HOME` not set to JDK 17 — re-run `export JAVA_HOME=$(/usr/libexec/java_home -v17)`.               |
| Chrome address bar visible inside the TWA              | `assetlinks.json` missing / wrong fingerprint / wrong package name. Re-verify all three.                |
| Play Console rejects: "Permission not declared"        | Some web API the page calls (e.g. geolocation) needs a matching `<uses-permission>` in the manifest.    |
| Play Console rejects: "App bundle not signed"          | You built with `bubblewrap build --skipPwaValidation` and forgot to actually sign. Re-run without skip. |
| Push notifications no-op for some users on Android <13 | Web Push works inside TWA, but Android 13+ requires runtime POST_NOTIFICATIONS permission.              |
