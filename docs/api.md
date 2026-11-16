# Public API (v1)

Other apps and scripts can set your status and Show now, and see what your lights show, through `https://bzzy.ca/api/v1`. A Stream Deck button, a Home Assistant automation, a Power Automate flow or a few lines of PowerShell all work the same way.

The full docs, with examples and recipes, are at [bzzy.ca/docs/api](https://bzzy.ca/docs/api). The machine-readable description is at [`/api/v1/openapi.json`](https://bzzy.ca/api/v1/openapi.json): import it into Postman or a client generator.

## Tokens

Make a token in **Settings → API tokens**. Give it a name (what it's for), pick what it can do and when it expires, and copy it: it's only shown once. Paste it into the integration. Revoke it there when you stop using it.

| Scope | Lets the token |
| --- | --- |
| `read` | see your status, Show now, your lights and the GIFs you can use |
| `status` | set and clear your status |
| `show` | put up and take down Show now |
| `webhooks` | add, change and remove your webhooks |
| `push` | send and end team pushes, in teams where you're an owner or admin |

Send it in the `Authorization` header, never in the URL:

```
Authorization: Bearer bzzy_pat_…
```

Tokens start with `bzzy_pat_`, so they're easy to search for if one leaks. Only a hash is stored. Signing in to the website doesn't let a page call the API: the API only reads this header, never cookies. You can have up to 20 live tokens. A superadmin can turn off someone's tokens.

## Quick start

Set Busy for 45 minutes:

```
curl -X PUT https://bzzy.ca/api/v1/status \
  -H "Authorization: Bearer $BZZY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"busy","text":"On a call","minutes":45}'
```

The same in PowerShell (Windows, or a Power Automate desktop flow):

```powershell
$h = @{ Authorization = "Bearer $env:BZZY_TOKEN" }
Invoke-RestMethod -Method Put -Uri https://bzzy.ca/api/v1/status -Headers $h `
  -ContentType application/json -Body '{"status":"busy","text":"On a call","minutes":45}'
```

Back to your calendar:

```
curl -X DELETE https://bzzy.ca/api/v1/status -H "Authorization: Bearer $BZZY_TOKEN"
```

## Endpoints

| Method and path | Scope | What it does |
| --- | --- | --- |
| `GET /me` | any | who the token belongs to, its name, scopes and expiry |
| `GET /status` | `read` | the status your lights show now and why |
| `PUT /status` | `status` | set a manual status |
| `DELETE /status` | `status` | clear it, back to your calendar or the light's default |
| `GET /show` | `read` | the current Show now, or `null` |
| `PUT /show` | `show` | put a message and/or GIF on your lights |
| `DELETE /show` | `show` | take it down |
| `GET /lights` | `read` | your lights and what each one shows right now |
| `GET /gifs` | `read` | GIFs `PUT /show` can use |
| `GET /teams` | `read` or `push` | the shared teams you're in, your role, and whether you can push |
| `GET /teams/{id}` | `read` or `push` | one team: its people (id, name, role) and live pushes |
| `POST /teams/{id}/pushes` | `push` | send a push to everyone, or to `people` (owners and admins only) |
| `DELETE /teams/{id}/pushes/{pushId}` | `push` | end a push for everyone |
| `GET /webhooks` | `webhooks` | your webhooks |
| `POST /webhooks` | `webhooks` | add one; the answer has its signing secret, shown once |
| `GET /webhooks/{id}` | `webhooks` | one webhook, with its last 20 deliveries |
| `PATCH /webhooks/{id}` | `webhooks` | change its URL, events or name, or turn it off or on |
| `DELETE /webhooks/{id}` | `webhooks` | remove it |
| `POST /webhooks/{id}/test` | `webhooks` | send it a `ping` and say how it went (5 a minute) |

JSON in and out. Times are ISO 8601 in UTC (`"2026-11-16T03:12:42.000Z"`).

### `PUT /status`

```json
{ "status": "busy", "text": "On a call", "minutes": 45 }
```

- `status`: `free`, `busy`, `dnd` or `away`.
- `text` (optional): shown under the status. Cut to what the screen holds (47 bytes, plain ASCII draws best).
- `minutes` or `until` (optional, not both): when it ends, at most 7 days ahead. `until` is an ISO 8601 time with an offset. Neither: until it's cleared.

Setting a status takes down Show now, like a press on the light. A press on the light later still wins.

### `GET /status`

```json
{
  "status": "busy",
  "source": "calendar",
  "text": "Standup",
  "until": "2026-11-16T17:30:00.000Z",
  "manual": null,
  "meeting": { "status": "busy", "text": "Standup", "start": "…", "end": "…" },
  "next": { "status": "away", "text": "Out of office", "start": "…", "end": "…" },
  "offHours": false
}
```

`source` is `manual` (someone set it), `calendar` or `default`. `manual.setBy` is `app`, `light`, or `api:<token name>`. `offHours` is true outside your working hours, when your lights are dark. Meeting titles only appear if you turned them on for that calendar.

### `PUT /show`

```json
{ "text": "Back at 2", "gif": "builtin:busy-pulse", "ring": { "pattern": "pulse", "color": "#2979ff" }, "minutes": 30 }
```

- `gif` (optional): an `id` from `GET /gifs`: `builtin:<id>` or `asset:<id>` (an upload of one of your teams).
- `text` (optional): needs a GIF, text or both.
- `ring` (optional): `pattern` (`solid`, `pulse`, `blink`, `strobe`, `spin`), `color` (`#rrggbb`), `speed` (1 to 3), `for` (seconds of flashing before it goes steady). Lights with flashing turned off stay steady.
- `minutes` or `until`: as for status.

A team push from an admin beats your own Show now while it's up (`hiddenByPush` says so).

### `GET /lights`

Each light: `id`, `name`, `online`, `lastSeenAt`, `firmwareVersion`, `dark` (off outside working hours), `screen` (`layout`, `status`, `text`, `until`), `ring` (what the ring is doing, or `null` for steady), and `push` (a team push on it, if any). It's the same thing the Status page preview shows.

### `POST /teams/{id}/pushes`

```json
{ "text": "Fire drill at 2", "ring": { "pattern": "strobe", "color": "#ff2000", "for": 30 }, "minutes": 30, "people": [] }
```

Like `PUT /show` (`text`, `gif`, `ring`), plus `people`: user ids from `GET /teams/{id}`, or empty for everyone. `minutes` or `until` up to 24 hours, or neither to keep it up until someone ends it. The role is checked on every call, as on the team page, and the push is in the team's log. A newer push replaces an older one on each light; each person can dismiss it with their light's button. Lights show pushes from the team they follow (Devices page).

### Writes that change nothing

If a `PUT` or `DELETE` wouldn't change anything (Busy is already set, there's no Show now to take down), it saves nothing and answers `200` with `"changed": false`. Integrations can resend the same state as often as the rate limit allows.

## Webhooks

A webhook is a URL bzzy `POST`s to when something happens. Add one in **Settings → Webhooks** (or `POST /webhooks`), pick the events and give the receiver the `whsec_` signing secret, which is shown once. Up to 10 per person.

| Event | Sent when | `data` |
| --- | --- | --- |
| `status.changed` | the status your lights show changes: from the app, a light, the API, a meeting starting or ending, a status running out, or working hours starting or ending | `status` (as `GET /status`) and `previous` |
| `show.changed` | Show now goes up, changes or comes down | `show` (as `GET /show`) and `previous` |
| `button.pressed` | a press on one of your lights changes the status | `light` (`id`, `name`), `status` (`null`: back to the calendar), `pressedAt` |
| `push.received` | a team push is sent to you (or everyone in your team, you included) | `team` (`id`, `name`), `push` (as in `GET /teams/{id}`) |
| `ping` | **Send test** | `webhook`, `message` |

```json
{ "type": "status.changed", "timestamp": "2026-11-16T17:00:04.000Z", "version": "1", "data": { "status": { … }, "previous": { … } } }
```

- **Signed like [Standard Webhooks](https://www.standardwebhooks.com/)**: `webhook-id`, `webhook-timestamp` (unix seconds) and `webhook-signature` headers. The signature is `v1,` and the base64 HMAC-SHA256 of `id.timestamp.body`, keyed with the secret after `whsec_` (base64-decoded). Their libraries check it; the docs page has Node, Python and PowerShell. Refuse anything more than 5 minutes old.
- **Timing**: changes from the app, the API or a press go out straight away. Changes nothing saves (a meeting starting, a status running out, working hours) are noticed when a light checks in, within about 20 s in working hours and 5 minutes outside them, and only while a light is online.
- **Delivery**: 5 s per try, any `2xx` counts, otherwise tried again 2 s and then 10 s later. Redirects aren't followed. At least once: each event keeps one `webhook-id` for all its tries, so drop repeats. After 20 failures in a row the webhook turns itself off; Settings shows the last 20 deliveries.
- **Safety**: `https://` only, public addresses only (checked when it's saved and on every send, `app/src/lib/safe-fetch.ts`). The secret is stored encrypted with a key derived from `AUTH_SECRET` (`WEBHOOK_SEAL_KEY` overrides it, so `AUTH_SECRET` can be rotated without breaking webhooks).

## Errors

Every error has the same shape:

```json
{ "error": { "code": "missing_scope", "message": "This token can't do that. …", "field": null } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_request` | the body isn't JSON, or a field is wrong (`field` names it) |
| 401 | `unauthorized` | no token, or it was revoked or has expired |
| 403 | `missing_scope`, `not_allowed` | the token can't do this, or you can't in that team (only owners and admins push) |
| 404 | `unknown_gif`, `not_found` | no such GIF (or not one you can use), or no such webhook, team or live push |
| 415 | `unsupported_media_type` | send `Content-Type: application/json` |
| 429 | `rate_limited` | too many requests; wait `Retry-After` seconds |
| 500 | `server_error` | our fault; quote the `X-Request-Id` header |

## Rate limits

Per token, per minute: 60 reads and 20 writes. Failed sign-ins: 30 a minute per address. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds). Please poll no faster than every 30 seconds.

## Versioning

The version is in the path. Within v1 we only add things: new endpoints, new optional fields, new response fields. Ignore fields you don't know. Anything that would break a client (removing or renaming a field, a new status value) waits for v2, and v1 then keeps working for at least 6 months with `Deprecation` and `Sunset` headers.

## Terms

bzzy is source-available under the PolyForm Noncommercial license, and the hosted app runs on a non-commercial plan. Integrations that use the API must be free to use. Ask if you'd like an exception.

## How it's built

- `app/src/app/api/v1/*`: the routes. `app/src/lib/api-http.ts` wraps each one: token, scope, rate limit, CORS, errors.
- `app/src/lib/api-tokens.ts`: tokens (table `api_token`, migration 0013). Checking a token is a cache read; revoking expires its `k-` tag.
- `app/src/lib/api-snapshot.ts`: what the reads need about a person, cached under their `u-`, `d-` and `t-` tags like a light's poll (see [caching.md](caching.md)). An integration polling `GET /status` doesn't wake the database.
- `app/src/lib/api-actions.ts`: the writes, using the same functions as the web app.
- `app/src/lib/api-rules.ts`: the pure parts, with tests.
- `app/src/lib/api-teams.ts`: teams and pushes. `GET /teams/{id}` is cached under the team's `t-` tag (`apiteam:v1:{teamId}`), so watching for pushes doesn't wake the database; sending and ending go through `app/src/lib/pushes.ts` like the team page.
- `app/src/lib/webhooks.ts`: webhooks (table `webhook`, migration 0014). There's no queue on Vercel Hobby, so events are sent from `after()` of the request that noticed them: a write, or a light's poll (`noticeChanges`), which compares with what was last sent (cached under `whseen:v1:{userId}`). `app/src/lib/webhook-rules.ts` holds the pure parts: signing, what counts as a change, delivery results.
