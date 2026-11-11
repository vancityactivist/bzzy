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
  "schedule": [
    { "start": 1762898400, "end": 1762902000, "status": "busy", "text": "Council meeting" }
  ]
}
```

- Times are unix seconds (UTC).
- `status` is one of `free`, `busy`, `dnd`, `away`.
- `manual` may be `null`. `until: 0` means "until cleared". Send `active: false` with an `updatedAt` when an override is cleared, so the device can tell old from new.
- `schedule` covers the next 24 hours, at most 32 blocks, already expanded from the ICS feeds (recurring events resolved). The device does no ICS parsing. The app's rules: cancelled and free events are ignored, out of office is `away` (all-day too), other timed events (busy, tentative) are `busy`, other all-day events are ignored. Back-to-back blocks of the same status are joined. `text` is "In a meeting" / "Out of office" unless the person turned on meeting titles for that calendar.
- `serverTime` is when the response was built. The device treats the schedule as stale after 24 hours without a successful sync.

## `POST {api}/api/device/{deviceId}/override`

Sent when someone presses the button on the device. Retried until it succeeds.

```json
{ "active": true, "status": "dnd", "updatedAt": 1762891300 }
```

The app should store it as the current manual override, keeping `updatedAt` as sent. When the device and the app disagree, the newer `updatedAt` wins, and a tie goes to the app.

## How the device decides what to show

1. A manual override that hasn't expired.
2. A schedule block covering now.
3. `defaultStatus`.

If the last successful sync is more than 24 hours old (or the clock isn't set yet), steps 2 and 3 are replaced by the **fallback** status: a slow grey breathing light and a "No recent calendar data" note. A manual override still shows.

The logic is in `firmware/lib/core/src/status_engine.cpp` and covered by `firmware/test/`.
