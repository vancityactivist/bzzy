# Public API (v1)

Other apps and scripts can set your status and Show now, and see what your lights show, through `https://bzzy.ca/api/v1`. A Stream Deck button, a Home Assistant automation, a Power Automate flow or a few lines of PowerShell all work the same way.

The machine-readable description is at [`/api/v1/openapi.json`](https://bzzy.ca/api/v1/openapi.json): import it into Postman or a client generator.

## Tokens

Make a token in **Settings → API tokens**. Give it a name (what it's for), pick what it can do and when it expires, and copy it: it's only shown once. Paste it into the integration. Revoke it there when you stop using it.

| Scope | Lets the token |
| --- | --- |
| `read` | see your status, Show now, your lights and the GIFs you can use |
| `status` | set and clear your status |
| `show` | put up and take down Show now |

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

### Writes that change nothing

If a `PUT` or `DELETE` wouldn't change anything (Busy is already set, there's no Show now to take down), it saves nothing and answers `200` with `"changed": false`. Integrations can resend the same state as often as the rate limit allows.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "missing_scope", "message": "This token can't do that. …", "field": null } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_request` | the body isn't JSON, or a field is wrong (`field` names it) |
| 401 | `unauthorized` | no token, or it was revoked or has expired |
| 403 | `missing_scope` | the token can't do this |
| 404 | `unknown_gif` | no such GIF, or not one you can use |
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
