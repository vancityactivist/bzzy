# Calendars

How bzzy turns calendars into status, and where Google and iCloud support is heading.
Full plan: the "bzzy: Google and iCloud calendars" design doc (2026-11-22).

## Today

- Calendars belong to a person. Each calendar has **Shows on** (`calendar.light_ids`):
  empty means every light that follows you; a list means exactly those lights, which can
  include lights with their own status (a meeting-room light, say). Set it under More on
  Settings → Calendars, or tick calendars on a light's page (`calendarsForLight` in
  `lib/calendar-lights.ts`).
- Your own status (Home page, team dashboard, `/v1/status`) uses the calendars that reach a
  light that follows you (`personCalendars`), so a calendar picked only for an own-status
  light doesn't make you busy.
- Sources: ICS links (Outlook published calendars, Google secret address, iCloud public
  calendar) and connected Google accounts (read-only). Read lazily: a poll or page load re-reads any calendar older than 5 minutes,
  after responding. No cron.
- Where calendars overlap, the strongest status wins: away, then do not disturb, then
  busy (`explainSchedule` / `mergeSchedule` in `app/src/lib/ics.ts`). Only when the status
  is equal does calendar order matter: the calendar higher in the list decides whose title
  shows.
- Each calendar has **Counts as**: each event's own setting (default), or always busy,
  always do not disturb, always away (`calendar.counts_as`). Handy for a "Focus" or
  "Travel" calendar.
- Shared Google calendars (ones you don't own) only count events you've accepted or said
  maybe to. Your own calendars count everything except what you declined.
- Settings → Calendars (`/settings/calendars`) has the combined next 24 hours (with the
  calendar behind each block), the calendars setting status in priority order (up/down
  buttons, Counts as, More for titles/refresh/remove), and accounts as folded groups with an
  on/off switch per calendar. Google and CalDAV calendar lists are re-read once a day there,
  so calendars added in Google or iCloud show up.
- The same meeting on two calendars (same iCalendar UID and start) shows once.

## Data model

- `calendar_account`: one connection to Google or a CalDAV server. The refresh token or
  password is encrypted in the app (AES-256-GCM, key in a Vercel env var, key id kept for
  rotation) and never sent to the browser.
- `calendar`: `source` (`ics`, `google`, `caldav`), `account_id`, `external_id`,
  `ics_url` (ICS only), `sets_status`, `counts_as`, `position` (priority, 0 first),
  `color` (from the provider), `sync_state` (sync tokens, push channel, `owned`).

## Google

- Settings → Calendars, **Connect Google Calendar**: `/api/calendar/google/connect` sends you
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

## iCloud and other CalDAV servers

- Settings → Calendars, Add a calendar: pick iCloud, Fastmail or Other (server address),
  then the login and an app-specific password. bzzy finds the calendars (current-user-principal,
  then calendar-home-set, `.well-known/caldav` as a fallback) and adds every event calendar,
  all setting status (CalDAV servers don't list holiday or birthday calendars). Reminder and
  task lists are skipped.
- Each refresh asks the calendar's ctag first and only downloads events when it changed or
  the week moved on (marker in the runtime cache), then a time-range REPORT; the events go
  through the same ICS rules (`lib/ics.ts`).
- Requests go through `davRequest` (`lib/safe-fetch.ts`): HTTPS, public addresses only,
  redirects re-checked, the login only sent to the same host (or within icloud.com /
  fastmail.com, which hand out per-account hosts).
- A refused password marks the account "needs reconnect" and shows an Update password form;
  the new one is checked against the server before it's saved.
- The password is sealed like Google's refresh token (`CALENDAR_KEY`). Apple's app-specific
  passwords can't be limited to calendars, which the connect form says.

## Next

1. Google push notifications for near-instant updates.
2. Google review (submitted 2026-11-21).
