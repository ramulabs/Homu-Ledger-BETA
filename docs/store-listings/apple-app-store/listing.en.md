# Apple App Store — HOMU Ledger (English / en-US)

Primary listing for the App Store. Fill in App Store Connect →
<https://appstoreconnect.apple.com> → My Apps → HOMU → App Store tab →
English (U.S.) version.

**Char limits enforced by App Store Connect** — counts shown next to each
field are conservative.

---

## App name (≤ 30 characters)

```
HOMU — Shared Ledger
```

_(20 chars.)_

## Subtitle (≤ 30 characters)

```
Couples & family spending
```

_(24 chars.)_

## Promotional text (≤ 170 characters)

Promotional text can be updated *between releases* without re-submission
— use it for time-sensitive things ("now with reports!") rather than
core feature descriptions.

```
Track shared spending with your partner or family. Voice-to-add in
English & Bahasa Indonesia. Receipts via photo. No ads, no bank
linking required.
```

_(157 chars.)_

## Description (≤ 4000 characters)

```
HOMU is a shared expense tracker built for couples and families who
manage money together — not against each other.

It's the answer to "who paid for groceries this month?" and "how much
are we actually spending on takeout?" — without the friction of
spreadsheets, the noise of bank-aggregator apps, or the awkwardness of
a Venmo transaction log.

WHO IT'S FOR
• Couples splitting bills, rent, and groceries
• Families pooling household spending
• Roommates settling up at the end of the month
• Anyone tired of forgetting to log cash purchases

CORE FEATURES
• Add a transaction in under 5 seconds — amount, category, optional
  photo of the receipt
• Voice-to-add: tap the mic, say "20k coffee", done. Bahasa Indonesia
  voice input is first-class, not an afterthought
• Multiple wallets — bank card, e-wallet, joint cash, each tracked
  separately
• Shared household ledger — invite your partner, see each other's
  entries in real time
• Category insights — see exactly where the month's money went
• Bilingual interface: English and Bahasa Indonesia, switchable anytime
• Privacy first — no ads, no analytics SDKs sold to data brokers, no
  bank-account linking unless you choose to

WHY HOMU
We built HOMU because we were tired of the same trade-off in every
other expense app: either it's a slick American app that doesn't
understand Bahasa Indonesia, or it's a local app stuffed with ads and
dark patterns. HOMU is both — slick AND local — and it stays free for
the core ledgering features.

HOW IT WORKS
1. Install, sign in with email or your Apple ID
2. Set up your wallets (Cash, BCA card, Gopay — whatever you use)
3. Invite your household — partner, kids old enough to be trusted
   with money, roommates
4. Start logging — voice, photo of a receipt, or just type
5. Open Reports at the end of the month to see where it all went

PRIVACY
HOMU stores your transaction history in our own Supabase project,
hosted in the Tokyo region. We don't sell data. We don't show ads. We
don't require linking a bank account. Full privacy policy at
https://homu.ramu.app/privacy.

WHAT'S NOT IN HOMU (BY DESIGN)
• No automatic bank import (planned — we want to ship it right, not
  fast)
• No investment tracking
• No budgeting envelopes (planned for v2)
• No tax export (planned for v2)

Questions? Email us — support address in the listing.

---

HOMU is built by Ramulabs, an indie team based in Jakarta. Feedback
and feature requests are read by humans, not bots.
```

_(~2200 chars of 4000.)_

## Keywords (≤ 100 characters, comma-separated, NO SPACES after commas)

Apple deprecates spaces between keywords — strip them. Keywords don't
need to repeat words already in the title / subtitle / category.

```
expense,budget,family,couple,ledger,shared,roommate,bahasa,indonesia,receipt,voice,rupiah,IDR
```

_(99 chars.)_

## Support URL

```
https://homu.ramu.app/help
```

_(Create the page or redirect it to a contact form before submission.)_

## Marketing URL (optional)

```
https://homu.ramu.app
```

## Privacy policy URL (mandatory)

```
https://homu.ramu.app/privacy
```

## App icon

- [ ] 1024×1024 PNG, **no alpha channel**, **no rounded corners**
      (Apple applies the mask).
- [ ] Source: regenerate from the source logo via
      `npx capacitor-assets generate --ios` — see
      `scripts/native-ios-bootstrap.md` step 4.
- [ ] Solid background only (Apple rejects icons with transparency).

## Screenshots — checklist (do NOT auto-generate, capture real ones)

App Store Connect requires screenshots for at least **one** display class
per device. The fewer screenshots Apple needs, the higher the chance
they auto-scale your largest set. To be safe, ship one set per current
device class:

- [ ] **6.7" iPhone display (iPhone 14 Pro Max, 15 Plus, 16 Plus)**
      — 1290×2796 portrait. 3 to 10 screenshots. **MANDATORY** —
      everything else scales from this.
- [ ] **6.5" iPhone display (older iPhones)** — 1242×2688. Apple will
      auto-scale from 6.7" if omitted, but reviewers prefer dedicated.
- [ ] **5.5" iPhone display (iPhone 8 Plus)** — 1242×2208. Required
      ONLY if you support iOS 12 or earlier — we set deployment
      target to iOS 15+, so this can be skipped.
- [ ] **12.9" iPad Pro** — 2048×2732 portrait. Required if the app is
      universal (we ship universal — see `LSRequiresIPhoneOS` true +
      iPad orientations in Info.plist). Required.
- [ ] **11" iPad Pro** — 1668×2388. Optional but recommended.

Suggested shots (same as Play, restaged for iOS):
1. Hero — Transactions list with a couple of recent entries (light)
2. Add Transaction sheet open mid-entry
3. Voice-to-add FAB in active state (waveform showing)
4. Reports — a category pie chart
5. Settings → Members — showing a shared household
6. Dark theme equivalent of #1

## App preview video (optional)

- [ ] One per device class, 15-30 sec, MP4 or MOV, H.264.
- [ ] Skip for v1 launch — adds complexity without much conversion
      lift for a finance utility.

## Age rating questionnaire (12+)

Apple's questionnaire — expected answers:

- Cartoon or fantasy violence: None
- Realistic violence: None
- Sexual content / nudity: None
- Profanity / crude humor: None
- Alcohol / tobacco / drug use: None
- Mature / suggestive themes: None
- Horror / fear themes: None
- Gambling: None
- Contests: None
- Unrestricted web access: No (HOMU only renders our own pages)
- Medical / treatment info: No

Expected rating: **4+** (or **Apple 12+** if reviewers consider the
"unrestricted web access" question more strictly because we have a
webview — be ready to argue down to 4+ since the webview only
loads our own domain via Universal Links).

## App Privacy ("nutrition labels") — draft answers

Apple's App Privacy section. Each item asks: "Do you collect X?" If yes,
"is it linked to identity? Is it used for tracking?"

### Contact Info → Email Address
- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Purpose: App Functionality (account sign-in)

### Financial Info → Other Financial Info
- Collected: YES (transaction amounts, wallet names, category names)
- Linked to user: YES
- Used for tracking: NO
- Purpose: App Functionality

### User Content → Photos or Videos
- Collected: YES (optional receipt photos)
- Linked to user: YES
- Used for tracking: NO
- Purpose: App Functionality (attach to transactions)

### User Content → Audio Data
- Collected: NO (Whisper streams + discards; we don't persist server-side)
- Note: although the mic *is* used, audio data is not stored
  past the request lifecycle. Apple's guidance is that data not
  retained ≠ collected.

### Identifiers → User ID
- Collected: YES (Supabase auth `uid`)
- Linked to user: YES
- Used for tracking: NO
- Purpose: App Functionality

### Diagnostics → Crash Data
- Collected: YES (Vercel built-in)
- Linked to user: NO (anonymised)
- Used for tracking: NO
- Purpose: App Functionality

### NOT collected
- Location (precise OR coarse)
- Sensitive Info
- Contacts
- Browsing / Search History
- Health & Fitness
- Purchases (we don't use Apple IAP at launch)
- Usage Data (we don't ship any analytics SDK)

## Account deletion (App Store guideline 5.1.1(v) — REQUIRED)

Apple requires in-app account deletion as of iOS 17. We currently support
email-based deletion. **Before submission:** ship the in-app deletion
flow (tracked as a RAM-13 follow-up).

Placeholder UX during review:
- Settings → Account → Delete account → opens
  `mailto:support@ramu.app?subject=Delete%20my%20account`. Apple may
  reject this as not sufficiently in-app. The follow-up ticket
  implements a proper in-app deletion confirmation flow.

## Build info — App Review

- **Demo account** — create one before review with:
  - Email: `apple-review@ramu.app`
  - Password: `<random, give to reviewer in submission notes>`
  - Pre-seeded with 5-10 transactions across two months so reviewers
    see Reports working.
- **Notes for reviewer**:
  > HOMU is a shared expense tracker for couples and families. The
  > demo account is pre-populated with sample data. Voice-to-add
  > requires microphone permission; if testing in a quiet
  > environment, please tap an existing transaction in the list to
  > view edit / delete flows. The app loads content from
  > https://homu.ramu.app via Universal Links; tap any HOMU URL on
  > the device to launch the app.
