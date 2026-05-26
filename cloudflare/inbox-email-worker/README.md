# HOMU Inbox Email Worker

Cloudflare Worker that receives forwarded transaction emails on
`*@homuinbox.ramu.app`, parses the MIME body with `postal-mime`, signs
the JSON payload with HMAC-SHA256, and POSTs to
`https://homu.ramu.app/api/inbox/email`.

This is the last piece of RAM-25 Phase 1. Everything else (DB schema,
API endpoints, Settings UI, chip + bento + accept/edit/reject) is
already live in production.

## One-time prereqs

- A Cloudflare account with the `ramu.app` zone in it.
- Node 18+ and npm on your machine.
- The webhook secret. It needs to match in **two** places:
  - Cloudflare Worker (via `wrangler secret put`).
  - Vercel env var `CF_EMAIL_WEBHOOK_SECRET` (Production + Preview).

Generate a fresh one if you don't have one:

```bash
openssl rand -hex 32
```

## Deploy the Worker

```bash
cd cloudflare/inbox-email-worker
npm install
npx wrangler login                    # one-time browser auth
npx wrangler secret put HOMU_WEBHOOK_SECRET
# paste the secret you generated above when prompted
npm run deploy
```

After deploy, the Worker is named `homu-inbox-email-worker` in your
Workers list.

To stream live logs while testing:

```bash
npm run tail
```

## Wire up Email Routing in the Cloudflare dashboard

1. https://dash.cloudflare.com → **Ramu Labs** → **ramu.app**.
2. **Email** → **Email Routing**. Click **Enable** if it isn't yet —
   Cloudflare auto-adds MX records on the apex.
3. **DNS** → **Records** → add MX + TXT records for the `homuinbox`
   subdomain (the apex's MX records cover `*@ramu.app`, not
   `*@homuinbox.ramu.app`):

   | Type | Name        | Content                       | Priority | Proxy |
   |------|-------------|-------------------------------|----------|-------|
   | MX   | homuinbox   | route1.mx.cloudflare.net      | 10       | OFF   |
   | MX   | homuinbox   | route2.mx.cloudflare.net      | 20       | OFF   |
   | MX   | homuinbox   | route3.mx.cloudflare.net      | 30       | OFF   |
   | TXT  | homuinbox   | "v=spf1 include:_spf.mx.cloudflare.net ~all" | — | OFF |

4. Back in **Email Routing** → **Routing rules** → **Create rule**:
   - **Action**: *Send to a Worker*.
   - **Worker**: `homu-inbox-email-worker`.
   - **Custom address** (matcher): `*@homuinbox.ramu.app` (catch-all on
     the subdomain).
   - Save.

## Set the same secret in Vercel

1. https://vercel.com/ramulabs/familyledger/settings/environment-variables.
2. Add **`CF_EMAIL_WEBHOOK_SECRET`** for **Production** and **Preview**.
   Paste the exact same hex string you used in `wrangler secret put`.
3. Trigger a redeploy of the latest production deployment
   (Deployments → ⋯ → Redeploy) so the new env var is loaded.

Until this env var is set, `/api/inbox/email` returns **503** and the
Worker's POST is rejected — that's by design (loud failure, no silent
inserts).

## Smoke test

### A. End-to-end via real email

1. In the HOMU PWA → Settings → Integrations → "Generate my inbox
   address" to get your `<local>@homuinbox.ramu.app`.
2. Forward (or send) a transaction email to that address.
3. Within ~30s the **N to review** chip appears on `/transactions`.
   Tapping shows the raw email pending (no parser yet — that's Phase 2).

### B. Endpoint smoke test without real email

You need the secret and your inbox address.

```bash
SECRET=<paste secret>
TO=<paste your address>

BODY="{\"to\":\"$TO\",\"from\":{\"email\":\"noreply@bca.co.id\"},\"message_id\":\"<test-$(date +%s)@bca>\",\"date\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"subject\":\"Test BCA\",\"text\":\"Telah dilakukan transaksi sebesar Rp 50.000 di Indomaret\"}"

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST https://homu.ramu.app/api/inbox/email \
  -H "Content-Type: application/json" \
  -H "X-Homu-Signature: $SIG" \
  -d "$BODY"
```

200 → row inserted. 401 → signature mismatch (secret differs between
the script and Vercel env). 503 → env var not set / not redeployed yet.

## When something goes wrong

| Symptom                                  | Likely cause |
|------------------------------------------|--------------|
| `/api/inbox/email` → 503                 | `CF_EMAIL_WEBHOOK_SECRET` not set in Vercel, or the deployment hasn't been redeployed since adding it. |
| `/api/inbox/email` → 401 "Invalid signature" | The Worker's `HOMU_WEBHOOK_SECRET` doesn't match Vercel's `CF_EMAIL_WEBHOOK_SECRET`. Regenerate + paste in both. |
| `/api/inbox/email` → 404 "Unknown recipient" | The recipient hasn't generated an inbox address in Settings → Integrations yet. |
| Email never arrives                       | MX records still propagating (≤ 1 hour), or the routing rule's matcher doesn't match the subdomain. `wrangler tail` will show inbound activity. |

## What this Worker does NOT do

- It doesn't parse bank-specific patterns. HOMU's parser lives in the
  Next.js endpoint (Phase 2 ships the regexes + Gemini fallback). Today
  the row lands with `parsed=null`.
- It doesn't forward the email anywhere — non-bank mail to your inbox
  address just sits in `inbox_items`. Don't reuse this domain for
  human-readable mail.
