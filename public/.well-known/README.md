# `/.well-known/` — TWA + Universal Links

This directory holds two files that *must* be served at predictable URLs for
the Android TWA and the iOS native shell to function correctly:

| File                                | Consumed by | Why                                                                                                |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `assetlinks.json`                   | Chrome on Android | Verifies the TWA package `app.ramu.homu.twa` is allowed to handle `https://homu.ramu.app/*` URLs without showing the URL bar. |
| `apple-app-site-association`        | iOS         | Lets `https://homu.ramu.app/*` taps open the native HOMU app instead of Safari (universal links). |

Both files are strict JSON. **Do not add comments to them** — the Android and
iOS parsers reject anything that isn't valid JSON. Comments live in this
README instead.

## Filling in the placeholders

### `assetlinks.json` — placeholder is `XX:XX:...` (the SHA-256)

1. Build the Android TWA at least once (see
   `scripts/native-android-bootstrap.md`) so a release keystore (`.jks`)
   exists.
2. From that directory, run:
   ```sh
   keytool -list -v -keystore android.keystore -alias android | grep SHA256
   ```
3. Copy the colon-separated, uppercase hex fingerprint into the
   `sha256_cert_fingerprints` array, replacing the `XX:XX:…` line.
4. Redeploy. Verify:
   ```sh
   curl -s https://homu.ramu.app/.well-known/assetlinks.json | jq
   ```
5. Cross-check with Google's tester:
   <https://developers.google.com/digital-asset-links/tools/generator>.

### `apple-app-site-association` — placeholder is `TEAMID`

1. Look up the Ramulabs Apple Developer Team ID — 10-char alphanumeric, at
   <https://developer.apple.com/account> → Membership Details.
2. Replace every `TEAMID` in the file (`TEAMID.app.ramu.homu`).
3. Redeploy. Apple's CDN mirrors the file within ~24h; verify with:
   ```sh
   curl -sI https://homu.ramu.app/.well-known/apple-app-site-association | head
   #   200 OK, Content-Type: application/json
   curl -s https://app-site-association.cdn-apple.com/a/v1/homu.ramu.app | jq
   ```
4. The file has **no `.json` extension** — Apple rejects it if you add one.
5. Excluded paths (login, signup, /auth/*, /privacy) stay in Safari because
   the OAuth flow is easier there. Everything else opens in the app.

## Why these files live in `public/`

Next.js serves anything under `public/` at the matching URL with no further
config — see <https://nextjs.org/docs/app/building-your-application/optimizing/static-assets>.
The middleware matcher in `middleware.ts` already excludes `_next/static`,
favicon, manifest, and sw.js; we'd add more exclusions if either file
needed special headers, but Vercel's default `application/json` for
`assetlinks.json` and the explicit content-type override for
`apple-app-site-association` (configured in `next.config.ts` headers — TODO
when the file is filled in for the first deploy) cover the production case.
