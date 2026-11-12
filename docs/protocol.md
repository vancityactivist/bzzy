# Device ↔ companion app protocol (v1)

The device only ever makes **outbound** HTTPS requests, so it works on guest Wi-Fi that blocks devices from reaching each other. Every request carries `Authorization: Bearer <device token>`.

## `GET {api}/api/device/{deviceId}/state`

Polled every 20 seconds, backing off to 5 minutes while requests keep failing.

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
- `serverTime` is when the response was built. The device treats the schedule as stale after 24 hours without a successful sync.

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

The status sets the LED colour and the screen's colours. On top of that, **show now** replaces the screen's content while it's live (not expired) and its `updatedAt` is at least the manual override's `updatedAt`. So a later button press, long press or status change from the app hides it, and a calendar change doesn't:

- With a GIF that has finished downloading: the show GIF, with the message (wrapped to 2 lines) or the status label in the bar under it.
- Otherwise, with a message: the message big and word-wrapped on the status colour (18 pt up to 4 lines, else 12 pt up to 6), the status label underneath.
- With neither yet (a GIF still downloading and no message): the normal status screen.

The logic is in `firmware/lib/core/src/status_engine.cpp` and `text_wrap.cpp`, covered by `firmware/test/`. The app's preview (`app/src/lib/screen.ts`) mirrors both.
