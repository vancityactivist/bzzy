# Email

The app sends a few emails through [Resend](https://resend.com), from `bzzy <noreply@bzzy.ca>`:

| Email | To | When | Reply-To |
| --- | --- | --- | --- |
| Team invite | the address typed on the invite form | an admin makes a one-person link and fills in "Email it to" | the admin who sent it |
| Welcome | the person who joined | someone joins a team through an invite link | |
| "Sam joined" | the team's owner and admins | the same | the person who joined |
| Contact form | `hello@bzzy.ca` (Cloudflare Email Routing forwards it on) | someone sends the form on the landing page | the sender |

Code: `app/src/lib/mail.ts` sends (plain `fetch` to Resend's API, no SDK), `app/src/lib/mail-templates.ts` has the bodies (unit-tested), `app/src/lib/team-mail.ts` the join emails, `app/src/app/contact-action.ts` the form.

## Settings

Vercel environment variables:

- `RESEND_API_KEY`: a **sending access** key restricted to the bzzy.ca domain. Without it nothing is sent: the invite form hides the email field and still shows the link, and the contact form says to email hello@ instead.
- `MAIL_FROM` (optional): defaults to `bzzy <noreply@bzzy.ca>`.
- `CONTACT_TO` (optional): defaults to `hello@bzzy.ca`.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: the Cloudflare Turnstile widget on the contact form (Cloudflare dashboard > Turnstile > Add widget, hostnames `bzzy.ca` and `localhost`, mode Managed). The site key is public and baked in at build time, so redeploy after setting it. Unset = no captcha. The server requires `success`, action `contact` and a hostname in `TURNSTILE_HOSTNAMES` (default `bzzy.ca`; never add `localhost` on production). Rejections log `[turnstile] rejected: ...` in Vercel's runtime logs with Cloudflare's error codes.

Links in emails use `https://bzzy.ca` in production (never bzzy.vercel.app) and the request's own host on previews.

## DNS (Cloudflare, bzzy.ca zone, all DNS only)

Added for Resend on 2026-11-17. They sit on `send.` and `resend._domainkey`, so they don't touch the apex MX records Email Routing uses for hello@.

| Type | Name | Value |
| --- | --- | --- |
| TXT | `resend._domainkey` | DKIM key from Resend |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `rsend` | `send.forge.rmta.net` |

## Limits

- Resend's plan allows a set number of emails a day site-wide, so each team can email at most 20 invites a day (`EMAIL_INVITES_PER_DAY` in `lib/teams.ts`).
- The contact form takes 3 messages a minute per address, has a hidden honeypot field, caps messages at 4,000 characters, and checks a Cloudflare Turnstile token (`lib/turnstile.ts`) on the server when `TURNSTILE_SECRET_KEY` is set. The widget only shows when Cloudflare wants a click. If Cloudflare can't be reached the form refuses and points to hello@bzzy.ca.
- An emailed invite works for whoever clicks it, like a copied link. The address is only recorded so admins can see who it went to.

## Design

`layout()` in `lib/mail-templates.ts`: the bzzy lockup (PNGs in `app/public/email/`, made from `docs/brand/bzzy-lockup-*.svg` at 3x because Gmail and Outlook don't show SVG), a white card, a black button, and a small footer. It's tables and inline styles. A `<style>` block adds dark mode (colours flip and the logo swaps, in Apple Mail and other clients that support it) and a full-width layout under 520 px. Gmail and Outlook apply their own dark mode, which these neutral colours survive. Every email also has a hidden preview line and a plain-text part.
