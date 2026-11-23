# Security policy

bzzy is a one-person project. Thanks for taking the time to look at it, and for reporting things privately.

## Supported versions

| What | Supported |
| --- | --- |
| Firmware | The latest `fw-vX.Y.Z` [release](https://github.com/vancityactivist/bzzy/releases/latest). Fixes ship as a new release, which lights install over the air. Pre-releases and `dev` builds you flash yourself aren't supported. |
| App and API | The live app at [bzzy.ca](https://bzzy.ca) (also `bzzy.vercel.app`), which runs the `main` branch. |
| Hardware | The current design files in `hardware/`. Archived revisions aren't. |

If you run your own copy of the app or build from a fork, please check the issue is still in `main` before reporting.

## Reporting a vulnerability

**Please don't open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub: go to the [Security tab](https://github.com/vancityactivist/bzzy/security) and choose **Report a vulnerability** ([direct link](https://github.com/vancityactivist/bzzy/security/advisories/new)). Only the maintainer can see it.

If you can't use GitHub, send a note through the contact form at the bottom of [bzzy.ca](https://bzzy.ca/#contact) saying you have a security issue and how to reach you, without the details, and I'll set up a private channel.

Helpful things to include:

- what's affected (firmware version and board, or the app page or API route)
- steps to reproduce, or a proof of concept
- what an attacker could do with it

## What to expect

I look after this in my spare time, so these are aims, not promises:

- I'll acknowledge your report within **7 days**.
- I'll tell you whether I can reproduce it, and roughly when a fix might land, within **30 days**.
- I'll keep you posted until it's fixed, then publish a GitHub security advisory. I'm happy to credit you there, or leave you out if you'd rather.

Please give me a reasonable chance to fix it, normally up to **90 days**, before you share details publicly. If it's being exploited, tell me and I'll move faster.

There's no bug bounty.

## Scope

In scope:

- **The app** (`app/`): sign-in (GitHub, passkeys, claim links), accounts, teams, lights, GIF uploads, calendar connections (Google, iCloud, ICS links), and anything that lets one account read or change another's data.
- **The public API** (`/api/v1`, see [docs/api.md](docs/api.md)): personal access tokens, scopes, rate limits and webhooks.
- **The provisioning API** (`/api/provision`, see [docs/provisioning.md](docs/provisioning.md)) and its one-time claim links.
- **Firmware updates** (see [docs/ota.md](docs/ota.md)): anything that gets a light to install firmware that wasn't signed by the release key, installs an older version, or defeats the A/B rollback.
- **The device protocol** (see [docs/protocol.md](docs/protocol.md)): pairing codes, device tokens, and the `/api/device` routes.
- **The firmware itself** (`firmware/`), including the setup page.
- **The release workflow** (`.github/workflows/`), for example anything that could leak the signing key or publish a release from an untrusted change.

Out of scope:

- The bzzy shop at `shop.bzzy.ca`. It lives in a separate private repository, but you can still report a problem with it the same way.
- Problems in third-party services bzzy uses (GitHub, Vercel, Neon, Google, Apple, Resend, Cloudflare, GIPHY). Please report those to the provider. A bug in how bzzy *uses* one of them is in scope.
- Attacks that need physical access to a light, such as reading its flash or reflashing it over USB.
- The open `bzzy-XXXX` setup Wi-Fi existing at all. It's open on purpose so a phone can join it, and it only appears on a new light or for 5 minutes after holding the button at power-on. Something you can do through it beyond setting the Wi-Fi is in scope.
- Denial of service, load testing, spam, and social engineering.
- Findings from automated scanners with no shown impact, missing security headers on their own, and outdated dependencies with no way to exploit them.

## Safe harbour

If you act in good faith under this policy, I won't take legal action against you or ask anyone else to, and I'll treat your research as authorised. In return, please:

- test only against your own account and your own lights, or a copy of bzzy you run yourself;
- don't access, change or keep other people's data. If you come across some by accident, stop, tell me, and delete it;
- don't degrade the service for others (no DoS, no mass requests);
- give me time to fix the issue before sharing it.

If you're not sure whether something is OK, ask first in your report.
