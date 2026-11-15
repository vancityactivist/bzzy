# bzzy companion app

Next.js app that holds your status, talks to bzzy devices, reads your calendar and hosts GIFs. It runs on Vercel at [bzzy.ca](https://bzzy.ca) (see [docs/domains.md](../docs/domains.md)).

- **Sign-in:** Auth.js with GitHub, plus passkeys added from Settings.
- **Data:** Postgres on Neon via Drizzle. Schema in `src/db/schema.ts`, migrations in `drizzle/`.
- **Files:** uploaded GIFs live in Vercel Blob.
- **Teams:** every user gets a personal team on sign-up. Devices, calendars and GIFs belong to a team, so shared office teams are a later addition, not a rewrite.
- **Device API:** `src/app/api/device/[id]/…`, implementing [docs/protocol.md](../docs/protocol.md).

## Run it locally

```sh
cp .env.example .env.local   # fill in the values
npm ci                       # not npm install: see CLAUDE.md
npm run db:migrate
npm run dev
```

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Adding a device

Plug the light in and follow its screen: scan the QR code to join its `bzzy-XXXX` Wi-Fi, pick your Wi-Fi, then scan the pairing QR code (or type its code at `/pair`) and add it. The light asks `POST /api/pair` for the code and polls `GET /api/pair/{id}` until someone claims it; see [docs/protocol.md](../docs/protocol.md#pairing). Needs migration `0012_device_pairing` (`npm run db:migrate`).

To pair with a local or preview copy of the app, open *Advanced* on the light's setup page and change only the app URL: leave the device ID and token empty, and it pairs with that app.

By hand, as before: Devices → Add a device, copy the device ID and token (shown once), then hold the top button (or BOOT) while plugging the light in and fill them in under *Advanced* on its setup page.
