# Device ↔ companion app protocol (v1)

The device only ever makes **outbound** HTTPS requests, so it works on guest Wi-Fi that blocks devices from reaching each other. Every request carries `Authorization: Bearer <device token>`.

## `GET {api}/api/device/{deviceId}/state`

Polled every 20 seconds, backing off to 5 minutes while requests keep failing.

Every request also says which firmware the device runs, so the app can offer updates ([ota.md](ota.md)):

| Header | Example | |
|---|---|---|
| `X-Bzzy-Firmware` | `0.2.0` | `dev` for a build flashed over USB |
| `X-Bzzy-Board` | `waveshare_s3_touch_lcd169` | the PlatformIO env |
| `X-Bzzy-Update-Failed` | `0.3.0` | only after an update rolled back |
| `X-Bzzy-Update-Now` | `1762891100` | the last "Update now" press it acted on |
| `X-Bzzy-Features` | `leds,push` | comma-separated extras this firmware understands: `leds` (LED styles), `push` (team pushes) |

```json
{
  "v": 1,
  "serverTime": 1762891200,
  "defaultStatus": "free",
  "manual": {
    "active": true,
    "status": "busy",
    "text": "On a call",
    "until": 1762894800,
    "updatedAt": 1762891100
  },
  "show": {
    "active": true,
    "text": "Happy Friday!",
    "until": 1762894800,
    "updatedAt": 1762891150,
    "gif": { "url": "https://bzzy.vercel.app/api/device/bz-ab12cd/gif/9a7e…", "sha": "41d0c2e9b7a3f615" }
  },
  "schedule": [
    { "start": 1762898400, "end": 1762902000, "status": "busy", "text": "Council meeting" }
  ],
  "gifs": {
    "free": { "url": "https://bzzy.vercel.app/gifs/free-ripple.gif", "sha": "d89fee3c49a4aeb2" },
    "busy": { "url": "https://bzzy.vercel.app/api/device/bz-ab12cd/gif/6f1c…", "sha": "0c4e9a7b1f2d3e4a" },
    "dnd": null,
    "away": { "url": "https://bzzy.vercel.app/gifs/away-orbit.gif", "sha": "5b8e…" }
  }
}
```

- Times are unix seconds (UTC).
- `status` is one of `free`, `busy`, `dnd`, `away`.
- `manual` may be `null`. `until: 0` means "until cleared". Send `active: false` with an `updatedAt` when an override is cleared, so the device can tell old from new.
- `show` is "show now": a GIF and/or message someone put on their screen from the app, on top of whatever the status is. It may be `null`. `gif` is `{ "url", "sha" }` like the entries in `gifs`, or `null` for a message on its own. `until: 0` means "until cleared". An expired or cleared one is sent as `active: false` with no GIF, so the device frees the file. The device downloads the GIF to `/gif/show.tmp` (before any status GIF, since someone just asked for it) and swaps it in as `/gif/show.gif`.
- `schedule` covers the next 24 hours, at most 32 blocks, already expanded from the ICS feeds (recurring events resolved). The device does no ICS parsing. The app's rules: cancelled and free events are ignored, out of office is `away` (all-day too), other timed events (busy, tentative) are `busy`, other all-day events are ignored. Back-to-back blocks of the same status are joined. `text` is "In a meeting" / "Out of office" unless the person turned on meeting titles for that calendar.
- `gifs` maps each status to `{ "url": "...", "sha": "..." }`, or `null` for no GIF (the plain colour card). The device downloads a GIF only when its `sha` changes, to `/gif/<status>.tmp`, then swaps it in. URLs on the app itself need the device's bearer token; the device never sends the token anywhere else. Built-in GIFs are static files; uploaded ones come from `GET {api}/api/device/{deviceId}/gif/{assetId}`. Responses without `gifs` (older apps) leave the device's GIFs alone.
- `firmware` is only there when the device should update: `{ "version": "0.3.0", "url": "{api}/api/device/{deviceId}/firmware/0.3.0", "size": 1234567, "sha256": "<hex>", "sig": "<base64>", "now": 0 }`. `now` is the time someone pressed "Update now" (install right away), or 0 for an automatic update. The `url` answers with a redirect to the file; the device follows it without its token. See [ota.md](ota.md).
- `ledStyles` (optional, firmware with the `leds` feature) says how the ring moves for each status: `{ "dnd": { "pattern": "pulse", "speed": 1 } }`. A status that's missing stays solid. See **LED styles** below.
- `meetingWarn` (optional, `leds` feature): `{ "minutes": 5, "leds": { "pattern": "pulse", "color": "#ff2000", "speed": 2 } }` flashes the ring from `minutes` before any `schedule` block starts until it starts. The device times it from the schedule it already has, so it still fires if Wi-Fi drops. `minutes: 0` or no `meetingWarn` turns it off.
- `push` (optional, `push` feature) says that `show` is a **team push**: `{ "id": "…", "updatedAt": 1762891150, "leds": { "pattern": "strobe", "color": "#ff2000", "speed": 2, "for": 30 } }`. See **Team pushes** below. `leds` is missing when the push doesn't flash.
- `serverTime` is when the response was built. The device treats the schedule as stale after 24 hours without a successful sync.

## LED styles

One object describes everything the ring can do. It's used by `ledStyles`, `meetingWarn.leds` and `push.leds`.

```json
{ "pattern": "pulse", "color": "#ff2000", "speed": 2, "for": 30 }
```

| Field | Values | |
|---|---|---|
| `pattern` | `solid`, `pulse`, `blink`, `strobe`, `spin` | an unknown name is treated as no style (solid) |
| `color` | `#rrggbb`, optional | missing = the status colour |
| `speed` | 1 slow, 2 normal, 3 fast | clamped to 1..3 |
| `for` | seconds, optional | after this long the ring goes steady in the same colour; missing or 0 = keeps going |

| Pattern | Speed 1 / 2 / 3 |
|---|---|
| `pulse`: fades between 25% and 100% | 4 s / 2 s / 1 s per cycle |
| `blink`: on and off, half each | 1 / 2 / 3 Hz |
| `strobe`: 60 ms bursts | 1 / 2 / 3 Hz |
| `spin`: a 4-LED arc with a fading tail goes round the ring (from D1 up) | 0.5 / 1 / 1.5 turns a second |

The firmware never flashes faster than 3 times a second, whatever it's sent. Which style plays, highest first: a team push's flash while the push is on screen (timed from the push's `updatedAt`), a meeting warning in its window, then the shown status's style, then solid. The "no recent calendar data" breathe is unchanged. The maths is in `firmware/lib/core/src/led_pattern.cpp`, covered by `firmware/test/`.

## Team pushes

A team admin can put a message and/or GIF (and a flash) on the lights of everyone in the team, or of picked people. A light shows pushes from the one team it follows (set on the Devices page). The newest live push for the light's owner, that they haven't dismissed, goes out in `show`, in place of their own "show now", so every firmware puts it on screen.

- Firmware **with** the `push` feature also gets `push`. While it's there, the show stays up whatever the status does (a button press, the app) until it expires or the person dismisses it. Any press while it's up (button, tap, long press) dismisses it instead of changing the status: the light hides it, remembers the id (kept across syncs and in its cache until the app stops sending that push) and sends `POST /push-ack`.
- Firmware **without** it gets the push as a plain `show` whose `updatedAt` is at least the manual override's, so it shows over the current status. A press hides it the usual way, and the app counts that press (via `/override`) as dismissing the push.

## `POST {api}/api/device/{deviceId}/push-ack`

Sent when someone dismisses a team push on the light. Retried until it succeeds. A dismissal counts for all of that person's lights.

```json
{ "id": "6f1c…", "at": 1762891300 }
```

The answer is `{ "acked": true }`, or `false` for a push the light's team doesn't have (nothing to retry).

## `POST {api}/api/device/{deviceId}/override`

Sent when someone presses the button on the device. Retried until it succeeds.

```json
{ "active": true, "status": "dnd", "updatedAt": 1762891300 }
```

The app should store it as the current manual override, keeping `updatedAt` as sent. When the device and the app disagree, the newer `updatedAt` wins, and a tie goes to the app. An applied press also clears "show now" if it's older than the press.

## How the device decides what to show

1. A manual override that hasn't expired.
2. A schedule block covering now.
3. `defaultStatus`.

If the last successful sync is more than 24 hours old (or the clock isn't set yet), steps 2 and 3 are replaced by the **fallback** status: a slow grey breathing light and a "No recent calendar data" note. A manual override still shows.

The status sets the LED colour and, normally, the screen's colours. On top of that, **show now** replaces the screen's content while it's live (not expired) and its `updatedAt` is at least the manual override's `updatedAt` (or, for a team push, until it's dismissed). So a later button press, long press or status change from the app hides it, and a calendar change doesn't.

It takes over the whole screen, on black, with no status label or time (the LEDs still show the status):

- With a GIF that has finished downloading: the GIF centred on the screen, or, with a message, centred in the top 200 rows with the message (wrapped to 2 lines) in the bar under it.
- Otherwise, with a message: the message big and word-wrapped in the middle of the screen (18 pt up to 4 lines, else 12 pt up to 6).
- With neither yet (a GIF still downloading and no message): the normal status screen.

The logic is in `firmware/lib/core/src/status_engine.cpp` and `text_wrap.cpp`, covered by `firmware/test/`. The app's preview (`app/src/lib/screen.ts`) mirrors both.
