# Google Play — HOMU Ledger (English / en-US)

Primary listing for the Google Play Store. Fill in the form at
<https://play.google.com/console> → HOMU app → Main store listing.

**Char limits enforced by Play Console** — counts shown next to each field
are conservative.

---

## App name (≤ 30 characters)

```
HOMU — Shared Expense Ledger
```

_(28 chars — leaves room for emoji modifiers if we ever want them.)_

## Short description (≤ 80 characters)

```
Track shared spending with your partner or family. Bilingual EN + ID. Free.
```

_(76 chars.)_

## Full description (≤ 4000 characters)

```
HOMU is a shared expense tracker built for couples and families who manage
money together — not against each other.

It's the answer to "who paid for groceries this month?" and "how much are
we actually spending on takeout?" — without the friction of spreadsheets,
the noise of bank-aggregator apps, or the awkwardness of a Venmo
transaction log.

WHO IT'S FOR
• Couples splitting bills, rent, and groceries
• Families pooling household spending
• Roommates settling up at the end of the month
• Anyone tired of forgetting to log cash purchases

CORE FEATURES
• Add a transaction in under 5 seconds — amount, category, optional photo
  of the receipt
• Voice-to-add: tap the mic, say "20k coffee", done. Bahasa Indonesia
  voice input is first-class, not an afterthought
• Multiple wallets — bank card, e-wallet, joint cash, each tracked
  separately
• Shared household ledger — invite your partner, see each other's entries
  in real time
• Category insights — see exactly where the month's money went
• Bilingual interface: English and Bahasa Indonesia, switchable anytime
• Privacy first — no ads, no analytics SDKs sold to data brokers, no
  bank-account linking unless you choose to

WHY HOMU
We built HOMU because we were tired of the same trade-off in every other
expense app: either it's a slick American app that doesn't understand
Bahasa Indonesia, or it's a local app stuffed with ads and dark patterns.
HOMU is both — slick AND local — and it stays free for the core
ledgering features.

HOW IT WORKS
1. Install, sign in with email
2. Set up your wallets (Cash, BCA card, Gopay — whatever you use)
3. Invite your household — partner, kids old enough to be trusted with
   money, roommates
4. Start logging — voice, photo of a receipt, or just type
5. Open Reports at the end of the month to see where it all went

PRIVACY
HOMU stores your transaction history in your own Supabase project, hosted
in the Tokyo region. We don't sell data. We don't show ads. We don't
require linking a bank account. Full privacy policy at
https://homu.ramu.app/privacy.

WHAT'S NOT IN HOMU (BY DESIGN)
• No automatic bank import (planned — we want to ship it right, not
  fast)
• No investment tracking
• No budgeting envelopes (planned for v2 — RAM-5)
• No tax export (planned for v2 — RAM-12)

Questions? Email us — support address in the Play listing.

---

HOMU is built by Ramulabs, an indie team based in Jakarta. Feedback and
feature requests are read by humans, not bots.
```

_(~2200 chars of 4000. Leaves room for a "What's new" feature flag on
launch.)_

## What's new (≤ 500 characters, per release)

For the v1.0 launch:
```
Welcome to HOMU on Play! This is our v1 — shared transaction logging,
voice-to-add, receipts via photo, multi-wallet, bilingual EN+ID. Found a
bug? Email us — every report is read by a human.
```

## Screenshots — checklist (do NOT auto-generate, capture real ones)

Play Store requires at minimum:

- [ ] **Phone**: 2 to 8 screenshots, 16:9 or 9:16, min 320 px, max 3840 px
      on the long side, 24-bit PNG/JPEG.
  - Recommended: 1080×1920 portrait or 1080×2400 (modern devices).
  - Suggested shots:
    1. Hero — Transactions list with a couple of recent entries (light theme)
    2. Add Transaction sheet open mid-entry
    3. Voice-to-add FAB in active state (waveform showing)
    4. Reports — a category pie chart
    5. Settings → Members — showing a shared household
    6. Dark theme equivalent of #1
- [ ] **7" tablet** (optional): 1 to 8, same format
- [ ] **10" tablet** (optional): 1 to 8, same format

## Feature graphic (mandatory)

- [ ] 1024×500 PNG, no alpha. Used on the store listing page above the
      screenshots.
- [ ] Suggested layout: HOMU wordmark left, a screenshot of the
      Transactions list right.

## App icon

- [ ] 512×512 32-bit PNG **with alpha** required by Play (different from
      Apple's 1024×1024 no-alpha requirement).
- [ ] Source: `public/icons/icon-512.png` may be reusable; verify on a
      real device — Play's adaptive icon mask can crop tighter than the
      maskable safe area we ship for PWA.

## Categorisation

- Category: **Finance** (primary)
- Tags: budget, expenses, family, couples
- Target audience: Adults 18–65, with kids 13+ secondary (HOMU has no
  user-generated content)

## Contact details

- Website: <https://homu.ramu.app>
- Email: support@ramu.app _(create this alias before publishing)_
- Privacy policy: <https://homu.ramu.app/privacy>

## Data safety form — draft answers

Play's Data Safety form is required before publishing. Draft answers below;
review with whoever owns the data flow before finalising.

### Data collected

- **Personal info** — Email address (required to sign in). Collected,
  linked to user, NOT shared with third parties. Encrypted at rest +
  in transit. Optional deletion: users can email support to request
  account deletion (until we ship in-app deletion under RAM-TBD).
- **Financial info** — Transaction history, wallet names, category
  names. Collected, linked to user, NOT shared. Encrypted at rest +
  in transit.
- **Photos** — Optional receipt images uploaded by the user.
  Collected, linked to user, NOT shared. Encrypted at rest + in
  transit. User can delete a photo by deleting the transaction.
- **App activity** — Crash logs only, via Vercel Analytics. Anonymised.
  NOT linked to user account.
- **Device info** — User-agent for the active-sessions list
  (`/settings/devices`). Linked to user, NOT shared.

### Data NOT collected

- Approximate or precise location
- Contacts / address book
- Calendar
- Messages or call logs
- Photos beyond the receipts the user explicitly uploads
- Audio beyond the voice-to-add recordings, which are streamed to Whisper
  and NOT retained server-side
- Web browsing history
- App browsing history (outside HOMU)

### Security practices

- ☑ Data is encrypted in transit (TLS 1.2+)
- ☑ Data is encrypted at rest (Supabase Postgres + storage encryption)
- ☑ You can request data deletion (currently via email; in-app under
  RAM-TBD)
- ☑ Independent security review: not yet — flag honestly

## Age rating — IARC questionnaire summary

Answer to most questions: **No** (HOMU has no violence, no gambling, no
sexual content, no profanity, no controlled substances, no UGC). Expected
result: **Everyone** / PEGI 3.

## Ads

- **Contains ads:** NO
- **In-app purchases:** NO at launch. Flip to YES when RAM-TBD ships
  the Premium tier (with Play Billing).
