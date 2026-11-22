# Provisioning API

How a shop (or anyone setting up lights for other people) hands a bzzy to its new owner: make an account for their email, pair the light to it on the bench, put it in ship mode, and send them a link that signs them in.

It's a small, private API for one trusted caller, separate from the public API in [api.md](api.md). It's off unless the app has a provisioning key.

## The flow

1. **Claim.** When an order is placed, the shop calls `POST /api/provision/claims` with the buyer's email and how many lights they bought. bzzy finds or creates the account for that email (and its personal team) and returns a claim id. Same `ref`, same claim, so retries are safe.
2. **Pair on the bench.** A superadmin pairs each light as usual (scan the QR code or type the code on `/pair`). The team picker has an **Assign to an order** group listing open claims ("BZ-0042 · Sam Lee (0 of 2 paired)"). Picking one makes the light the buyer's, in their personal team. It shows up in their account straight away.
3. **Ship.** When the box goes out, the shop calls `POST /api/provision/claims/{id}/ship`. Every light on the claim goes into ship mode, and the buyer gets the "set up your account" email if they haven't had it.
4. **Arrive.** The buyer plugs the light in at home and joins their Wi-Fi. Its first poll from there carries `X-Bzzy-Arrived: 1`, which ends ship mode, and the claim reports `onlineSinceShip: true` for it (see [protocol.md](protocol.md)). Firmware before ship mode never sends the header, so until then the shop marks orders delivered by hand.

### What the light does in ship mode

Firmware with the `ship` feature (it lists `ship` in `X-Bzzy-Features`):

- On the first answer with `ship: true` it saves the name of the Wi-Fi it's on, **forgets that Wi-Fi** (its device id and token stay), turns the ring off and shows **"Packed. You can unplug me now"**. Wait for that screen before unplugging it.
- At its new home there's no Wi-Fi saved, so it opens the usual `bzzy-XXXX` setup page. Once the owner picks their Wi-Fi it goes straight to their status: no pairing step.
- Its polls from a Wi-Fi with a **different name** from the bench one carry `X-Bzzy-Arrived: 1`. When the answer stops saying `ship: true`, it forgets ship mode.
- If it has no clock yet when it first connects (NTP gave up while the setup page was open), it takes the time from the app's `serverTime`, so it doesn't sit on "Waiting for the clock".
- If it's put back on the bench Wi-Fi while still in ship mode (to test it again, say), it packs itself again on its next poll, so it never reaches its owner with the bench Wi-Fi saved.

### Lights that are already set up

The admin page's **Devices** table has an **Order** column. **Assign to an order** puts a light that's already paired onto an open claim, keeping its id and token, so it doesn't have to be deleted and paired again. That's handy for testing ship mode with one of your own lights. **Take back** moves a light on a claim back to you, in your own lights, off the claim and out of ship mode. It works after the light has arrived too, unlike `DELETE`.

## The claim link

A buyer whose account can't sign in yet (no GitHub, no passkey) gets an email with a link to `/claim/{token}`:

- Pressing **Continue** signs them in. The link works once and runs out after 14 days.
- They land on a welcome page that offers to add a passkey or connect GitHub, so they can sign in again later. They can skip it.
- `POST …/invite` sends a fresh link; any earlier one stops working.
- Signing in through the link counts as proof of the email address.

Buyers who can already sign in get an email saying the lights are in their account, with no link.

## Setup

The key is a random string the shop keeps; bzzy only stores its SHA-256.

1. Make a key, for example `openssl rand -base64 32`.
2. In the bzzy project on Vercel, set `PROVISION_KEY_HASH` to its SHA-256 in hex: `printf %s "$KEY" | sha256sum` (PowerShell: `[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).Replace("-","").ToLower()`).
3. Give the key itself to the caller (the shop keeps it as `BZZY_PROVISION_KEY`).

Without `PROVISION_KEY_HASH`, every provisioning URL answers 404. A wrong key also gets 404, so the API doesn't advertise itself.

Lights from a cancelled claim go to a team called **Spare lights**, owned by the first superadmin (made the first time it's needed).

## Endpoints

Every request sends `Authorization: Bearer {key}`. Bodies and answers are JSON. Errors are `{ "error": "…" }` with a 4xx status. Nothing is cached.

| Method and path | What it does |
|---|---|
| `POST /api/provision/claims` | Make a claim. Body: `email`, `ref` (the order number, letters, digits and `._:-`, up to 64), `quantity` (1 to 50), optional `name`. `201` with `{ "id" }` for a new claim, `200` with the same id if `ref` already has one |
| `GET /api/provision/claims/{id}` | The claim and its lights (below) |
| `POST /api/provision/claims/{id}/ship` | Ship mode on for every paired light that isn't already shipped or home, and the email if it hasn't gone. Answers like `GET` |
| `POST /api/provision/claims/{id}/invite` | Send the email again, with a new link if they still can't sign in. `{ "sent": true, "url": null }`, or `sent: false` with the link in `url` when email isn't set up, so it can be passed on another way |
| `DELETE /api/provision/claims/{id}` | The order was cancelled. Its lights go to Spare lights, the claim is deleted, and so is the account if nothing else uses it (it never signed in, has no other claims or lights). `{ "lightsReturned": 1 }`. `409` if a light has already arrived |

`GET` answers:

```json
{
  "id": "…",
  "ref": "BZ-0042",
  "quantity": 2,
  "claimed": false,
  "claimedAt": null,
  "invitedAt": "2026-12-04T18:20:00.000Z",
  "devices": [
    {
      "id": "bz-ab12cd",
      "name": "bzzy",
      "serial": "bz-ab12cd",
      "firmwareVersion": "0.4.0",
      "lastSeenAt": "2026-12-04T18:19:41.000Z",
      "shipMode": true,
      "shippedAt": "2026-12-04T18:20:00.000Z",
      "onlineSinceShip": false,
      "arrivedAt": null
    }
  ]
}
```

`claimed` turns true once the buyer can sign in: straight away for an existing account, otherwise when they use the link.

## Code

- `app/src/lib/provision.ts`: claims, ship mode, the email, Spare lights, cancelling.
- `app/src/lib/claim-rules.ts`: input checks and the shapes above (tested).
- `app/src/app/api/provision/`: the routes. `app/src/app/(app)/claim/`: the link and welcome pages.
- `app/drizzle/0018_light_claims.sql`: the `light_claim` table and the device's `claim_id`, `ship_mode`, `shipped_at`, `arrived_at`.
