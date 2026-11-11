# bzzy companion app

Next.js app that holds your status, talks to bzzy devices, and (soon) reads your calendar and hosts GIFs.

- **Sign-in:** Auth.js with GitHub, plus passkeys added from Settings.
- **Data:** Postgres on Neon via Drizzle. Schema in `src/db/schema.ts`, migrations in `drizzle/`.
- **Teams:** every user gets a personal team on sign-up. Devices, calendars and GIFs belong to a team, so shared office teams are a later addition, not a rewrite.
- **Device API:** `src/app/api/device/[id]/…`, implementing [docs/protocol.md](../docs/protocol.md).

## Run it locally

```sh
cp .env.example .env.local   # fill in the values
npm install
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

1. Devices → Add a device. Copy the device ID and token (the token is shown once).
2. Hold BOOT while plugging the light in, join the `bzzy-setup` Wi-Fi from your phone, pick your Wi-Fi, and enter the app URL, device ID and token.
