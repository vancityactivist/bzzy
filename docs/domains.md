# Domains

The app lives at **https://bzzy.ca**. DNS for all three domains is on Cloudflare, registered at Hover.

| Domain | What it does |
|---|---|
| `bzzy.ca` | The app (production). Canonical. |
| `www.bzzy.ca` | Redirects to `bzzy.ca` (set in Vercel) |
| `getbzzy.ca`, `www.getbzzy.ca` | Redirect to `bzzy.ca` (set in Vercel) |
| `getbzzy.online`, `www.getbzzy.online` | Redirect to `bzzy.ca` (set in Vercel) |
| `bzzy.vercel.app` | The old address. Browsers are redirected to `bzzy.ca` by `app/next.config.ts`; `/api/device/*` and `/gifs/*` still answer here |

## Don't redirect bzzy.vercel.app in Vercel

A light saves its app URL in flash, and its API and update requests don't follow redirects. A domain-level redirect on `bzzy.vercel.app` would cut off any light still pointing there. The redirect in `next.config.ts` skips the device paths for that reason. Firmware moves a saved `https://bzzy.vercel.app` to `https://bzzy.ca` on boot (`firmware/src/net.cpp`).

## DNS (Cloudflare)

Every record that points at Vercel is **DNS only** (grey cloud). Vercel does TLS and caching; proxying through Cloudflare as well gets in the way of Vercel's certificate renewals.

Use the exact values Vercel shows under Project, Settings, Domains. At the time of writing that's an `A` record on the apex and a `CNAME` on `www`, for each of the three zones.

Email:

- `bzzy.ca`: Cloudflare Email Routing (MX + SPF records added by Cloudflare) forwards `hello@bzzy.ca`. Add `_dmarc TXT "v=DMARC1; p=none"` and tighten later. Sending from the app (Resend) will use a subdomain such as `send.bzzy.ca` and adds its own records.
- `getbzzy.ca`, `getbzzy.online` send no mail: `MX 0 .`, `TXT "v=spf1 -all"`, `_dmarc TXT "v=DMARC1; p=reject"`.

## Auth

- GitHub OAuth app callback: `https://bzzy.ca/api/auth/callback/github`. GitHub sign-in only works on that host.
- Vercel env, Production only: `AUTH_URL=https://bzzy.ca`.
- Passkeys are tied to the host they were made on. Passkeys made on `bzzy.vercel.app` don't work on `bzzy.ca`; add a new one in Settings.
