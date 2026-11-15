# Poll caching

A light polls `GET /api/device/{id}/state` every 20 seconds. If each poll read Postgres, the database would never go idle: Neon only suspends after 5 minutes without queries, so one light would use about 180 compute-hours a month, against the free plan's 100.

So the poll answers from Vercel's runtime cache, and while nothing changes it doesn't touch the database at all.

## What's cached

| Key | Holds | Written |
|---|---|---|
| `poll:v1:{deviceId}` | everything the poll reads: the device row, owner's time zone, presence, calendars (with cached events), GIFs, show now, firmware release, live pushes of the team it follows (`app/src/lib/poll-bundle.ts`) | on a miss, 3 h TTL |
| `seen:{deviceId}` | when the light last polled | about once a minute (`app/src/lib/seen.ts`) |
| `calchk:{calendarId}` | when a feed was last read and found unchanged | each refresh (`app/src/lib/calendar.ts`) |
| `fwchk` | when the firmware release was last checked and found unchanged | each check (`app/src/lib/firmware-release.ts`) |

The database is still the source of truth. Every cache read falls back to it, and a cache failure is treated as a miss.

- `lastSeenAt` in the database is only written every 6 hours, or when the light reports new firmware. Pages read the cached value through `liveSeen()` and take the newer one.
- A calendar or release re-read only writes to the database when something changed.

## The rule for new code

**Any write that changes what a light shows must expire a tag** with `expire()` from `app/src/lib/cache.ts`. The poll entry is saved under these tags (`app/src/lib/cache-codec.ts`):

| Tag | Expire it when |
|---|---|
| `d-{deviceId}` | the device row or its GIF choices change (settings, ring, token, update now, push team, delete) |
| `u-{userId}` | a person's presence, show now, calendars, or their lights' push team change |
| `t-{teamId}` | a team's pushes, acks or members change, or the team is deleted |
| `a-{assetId}` | an uploaded GIF is deleted |
| `fw` | the saved firmware release changes |

A change that forgets to expire its tag still reaches the light when the entry runs out (3 hours). That's a safety net, not a design. The TTL is long on purpose, because each reload wakes the database for 5 minutes.

If the shape of `PollBundle` changes, bump the `v1` in its key: entries outlive deployments.

Off Vercel (local dev, tests), `@vercel/functions` falls back to an in-memory cache.
