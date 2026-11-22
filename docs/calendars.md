# Calendars

How bzzy turns calendars into status, and where Google and iCloud support is heading.
Full plan: the "bzzy: Google and iCloud calendars" design doc (2026-11-22).

## Today

- Calendars belong to a person. Every light that follows them merges all their
  calendars that have **Sets my status** on.
- Sources: ICS links (Outlook published calendars, Google secret address, iCloud public
  calendar) and connected Google accounts (read-only). Read lazily: a poll or page load re-reads any calendar older than 5 minutes,
  after responding. No cron.
- Where calendars overlap, the strongest status wins: away, then do not disturb, then
  busy (`mergeSchedule` in `app/src/lib/ics.ts`).
- The same meeting on two calendars (same iCalendar UID and start) shows once.

## Data model

- `calendar_account`: one connection to Google or a CalDAV server. The refresh token or
  password is encrypted in the app (AES-256-GCM, key in a Vercel env var, key id kept for
  rotation) and never sent to the browser.
- `calendar`: `source` (`ics`, `google`, `caldav`), `account_id`, `external_id`,
  `ics_url` (ICS only), `sets_status`, `sync_state` (sync tokens, push channel).

## Google

- Settings, Calendars, **Connect Google Calendar**: `/api/calendar/google/connect` sends you
  to Google's consent screen; Google sends you back to `/api/calendar/google/callback` on
  bzzy.ca, which forwards to the preview the connect started on (same idea as GitHub sign-in,
  docs/domains.md). A one-time cookie must match the `state` before the code is used.
- Scopes: `openid`, `userinfo.email`, `calendar.calendarlist.readonly`,
  `calendar.events.readonly`. If either calendar scope is unticked on the consent screen, the
  connect is refused with a message.
- The account's main calendar sets your status; every other calendar is listed but off and
  isn't read at all until you tick it.
- Each refresh reads the next week of events (one small request per calendar, recurring
  events expanded by Google). Rules (`lib/google-events.ts`): out of office = away, focus time
  = do not disturb, declined / free / working location / other all-day = ignored, the rest
  = busy.
- The refresh token is sealed in `calendar_account`; the hourly access token is sealed in the
  runtime cache, so renewing it doesn't touch Postgres. A revoked grant marks the account
  "needs reconnect", keeps the last events and shows Reconnect in Settings.
- Disconnect revokes the token at Google and deletes the account and its calendars.

### Setup (once)

- Google Cloud project with the Google Calendar API on; Google Auth Platform: External,
  **In production** (Testing expires tokens after 7 days), the four scopes above.
- Web OAuth client, redirect URIs `https://bzzy.ca/api/calendar/google/callback` and
  `http://localhost:3000/api/calendar/google/callback`.
- Vercel env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Production + Preview),
  `CALENDAR_KEY` (32 random bytes, base64; a different one for Production and Preview).
  Until all three are set the connect button is hidden.
- Unverified, Google shows a warning screen and allows 100 users over the app's lifetime.
  Submit for verification (privacy policy at /privacy, demo video) before selling.

## Next

1. Google push notifications for near-instant updates.
2. CalDAV (iCloud with an app-specific password, Fastmail, Nextcloud).
3. Google review before the shop opens.
4. Calendars for lights that don't follow their owner.
