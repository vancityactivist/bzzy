# Calendars

How bzzy turns calendars into status, and where Google and iCloud support is heading.
Full plan: the "bzzy: Google and iCloud calendars" design doc (2026-11-22).

## Today

- Calendars belong to a person. Every light that follows them merges all their
  calendars that have **Sets my status** on.
- Sources: ICS links (Outlook published calendars, Google secret address, iCloud public
  calendar). Read lazily: a poll or page load re-reads any calendar older than 5 minutes,
  after responding. No cron.
- Where calendars overlap, the strongest status wins: away, then do not disturb, then
  busy (`mergeSchedule` in `app/src/lib/ics.ts`).
- The same meeting on two calendars (same iCalendar UID and start) shows once.

## Data model

- `calendar_account`: one connection to Google or a CalDAV server. The refresh token or
  password is encrypted in the app (AES-256-GCM, key in a Vercel env var, key id kept for
  rotation) and never sent to the browser. Empty until Google connect ships.
- `calendar`: `source` (`ics`, `google`, `caldav`), `account_id`, `external_id`,
  `ics_url` (ICS only), `sets_status`, `sync_state` (sync tokens, push channel).

## Next

1. Google connect (OAuth, read-only event scopes), calendar picker, incremental sync.
2. Google push notifications for near-instant updates.
3. CalDAV (iCloud with an app-specific password, Fastmail, Nextcloud).
4. Google review before the shop opens.
5. Calendars for lights that don't follow their owner.
