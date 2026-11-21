# Buying a built bzzy: batch orders (spec)

Status: **draft for review, no code yet.** Written 2026-11-19. Every default below is a proposal; the decisions Adam needs to make are collected in [Open questions](#16-open-questions), with the five biggest at the top.

> Nothing here is legal or tax advice. The legal section says what the rules appear to be and where to check, so the questions for a lawyer or accountant are short ones.

## Contents

1. [Summary](#1-summary)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [How a batch works](#3-how-a-batch-works)
4. [Order lifecycle](#4-order-lifecycle)
5. [Payments (Stripe)](#5-payments-stripe)
6. [Tax and shipping](#6-tax-and-shipping)
7. [Accounts, pre-pairing and teams](#7-accounts-pre-pairing-and-teams)
8. [Data model and migrations](#8-data-model-and-migrations)
9. [Pages](#9-pages)
10. [Admin and fulfilment](#10-admin-and-fulfilment)
11. [Email: transactional](#11-email-transactional)
12. [Email: marketing and CASL](#12-email-marketing-and-casl)
13. [Legal and operations](#13-legal-and-operations)
14. [Platform changes (Vercel Pro, no cron)](#14-platform-changes)
15. [Build plan](#15-build-plan)
16. [Open questions](#16-open-questions)

---

## 1. Summary

People who don't want to build their own bzzy can **reserve a spot in the next batch**. Reserving is free, or costs a small refundable deposit if Adam sets one on that batch (for example $5): we save their card with Stripe and charge nothing else. When the batch closes (full, or on its date), Adam presses **Close and charge**; every reservation is charged at once. Adam then orders parts for exactly that many lights, builds them, **pairs each light to its buyer's account at the bench**, and ships the whole batch. The buyer plugs it in, joins their Wi-Fi, and their status is already there.

Why this shape:

- **No money held for weeks.** Nobody pays until Adam is ready to order parts, so a batch that never fills costs nobody anything and needs no refunds.
- **Parts are bought against paid orders**, never on spec.
- **Small and manual on purpose.** A batch is 10 to 25 lights. Adam is in the loop for every state change, which suits Vercel with no cron (section 14).

## 2. Goals and non-goals

Goals

- Reserve, pay, track and receive a built bzzy without talking to Adam.
- Adam can run a batch end to end from `/admin`: open, close and charge, see the parts count, assign lights to orders, record tracking, refund.
- Every legally required notice (supply date, contract copy, delay, cancellation, refund) is an email the app sends on its own.
- Marketing email only to people who said yes, with proof of when and how (CASL).
- Lights arrive already in the buyer's account.

Non-goals for v1

- A general shop (cart, many products, discount codes, gift cards).
- Shipping outside Canada (see 6.3).
- Kits or loose parts (could come later as a second product).
- Subscriptions. bzzy stays free to use; the purchase is the hardware.
- Automated label buying (manual Canada Post labels for the first batches; see 10.4).

## 3. How a batch works

A **batch** is one production run with a size, a price and a promised ship date.

| Field | Default | Notes |
| --- | --- | --- |
| Capacity | 25 lights | Hard cap. When full, new people join the interest list for the next batch. |
| Minimum to build | 10 lights | Below this at the close date, Adam chooses: build anyway, extend, or cancel (nobody was charged). |
| Close date | about 3 weeks after opening | Closes earlier if it fills. |
| Ships by | close + 6 weeks | The legal "supply date" (13.2). Shown everywhere. Parts lead times below. |
| Price | CA$129 per light, plus shipping | Set on the product in admin and **editable any time** (10.6). Each batch copies the current price when it's created and Adam can change it while the batch is draft or open. Each order snapshots the price when reserved, so a change never alters an existing reservation. |
| Deposit | $0 (off) | Per batch, editable while draft. Adam may set a small refundable deposit (e.g. $5). See 5.1. |
| Per order | 1 to 3 lights | Keeps one buyer from taking a batch. |
| Products | one: "bzzy, built" | A batch can offer several products/variants later, each with its own capacity and price (8, `batch_item`). |

Lead-time budget behind "close + 6 weeks": JLCPCB main board PCBA (module, LEDs) 1 to 2 weeks, display panels 1 to 3 weeks, printed case parts 1 to 2 weeks (all ordered the day the batch is charged, in parallel), then a week for build, flash, burn-in and pairing, then Canada Post (2 to 7 business days). Adam should tune this after batch 1.

### Batch states

```
draft ──open──▶ open ──close──▶ charging ──▶ funded ──▶ building ──▶ shipping ──▶ done
                  │                              │
                  └──────── cancelled ◀──────────┘ (only before any light ships)
```

- **draft**: Adam is setting it up. Not visible.
- **open**: visible on bzzy.ca with a progress bar ("14 of 25 reserved, closes Dec 15, ships by Jan 26").
- **charging**: Adam pressed Close and charge. No new reservations. Each order is charged (5.3). Orders whose card fails get a payment window (default 72 h).
- **funded**: every order is paid, released or cancelled. The page shows the final count and the parts list (10.2). Adam orders parts.
- **building**: Adam marks parts ordered/arrived and builds. Optional progress emails.
- **shipping**: at least one order shipped.
- **done**: every order shipped or closed.
- **cancelled**: the batch didn't go ahead. Paid orders are refunded in full; reservations are released or moved to the next batch, as each buyer chooses.

There is at most one **open** batch at a time. When none is open, bzzy.ca shows "Next batch: get an email when it opens" (12.3).

## 4. Order lifecycle

One order = one buyer, one batch, 1 to 3 identical lights, one shipping address.

```
reserved ──charge──▶ paid ──▶ building ──▶ ready ──▶ shipped ──▶ delivered
   │          │                                         │
   │          └─▶ payment_due ──pay──▶ paid             └─▶ returned / refunded
   │                    └──(window ends)──▶ released
   └─▶ cancelled (by buyer, any time before charge; no money moved)
paid/building/ready ──cancel──▶ refunded (full refund, see 4.2)
```

| State | Meaning | Who moves it |
| --- | --- | --- |
| `reserved` | Card saved (SetupIntent succeeded), not charged | Stripe webhook |
| `payment_due` | Charge at close failed or needs the buyer (3-D Secure) | Stripe webhook |
| `paid` | Charged | Stripe webhook |
| `released` | Payment window ended unpaid; spot goes to the interest list | Admin (or lazy sweep, 14.2) |
| `building` | Batch moved to building | Admin, batch-wide |
| `ready` | Every light in the order is built, tested and paired to the buyer | Admin, per light |
| `shipped` | Tracking number recorded | Admin |
| `delivered` | Carrier says delivered, or the light's first poll from the buyer's Wi-Fi | Admin, or automatic on first poll |
| `cancelled` | Buyer cancelled before being charged | Buyer or admin |
| `refunded` | Money returned in full (partial refunds are recorded as events, not a state) | Admin, or Stripe webhook for disputes |

### 4.1 Cancelling

- **Before the batch is charged:** one button on the order page. Nothing to refund. Card detached from the order (kept on the Stripe customer only if they tick "remember my card").
- **After charge, before shipping:** one button too (default). Full refund, no deduction. Adam keeps the unit for the next batch. This is more generous than the law needs (13.2), but it is the simplest rule to explain, it removes most dispute risk, and at batch sizes of 25 the cost is small. See Q7.
- **After delivery:** returns (13.6).

### 4.2 Delays

If a batch will miss its ship-by date, Adam sets a new date in admin and writes a one-line reason. The app then:

1. Emails every paid order: new date, reason, and a **one-click cancel and full refund** link.
2. Logs the notice on each order (proof it was sent).
3. Shows the new date on the order page.

BC lets a distance-sale buyer cancel if goods haven't arrived within 30 days after the supply date (13.2). Offering the refund at every slip covers that and more.

### 4.3 Batch below minimum

At the close date with fewer than the minimum reserved, nothing is charged automatically. Admin sees three buttons: **Build anyway**, **Extend to <date>** (emails reservations the new dates, they can cancel), **Cancel batch** (emails reservations; each picks "move me to the next batch" or "cancel").

### 4.4 Moving between batches

Admin can move a `reserved` order to another open/draft batch (the buyer is emailed; price stays as reserved unless the buyer agrees). Paid orders aren't moved; they are refunded or wait.

## 5. Payments (Stripe)

### 5.1 Model: reserve free, charge at close, optional small deposit (decided)

Adam (2026-11-18): option A, with an optional small deposit such as $5. So each batch has a `deposit_cents` setting, default 0.

- **Deposit 0:** Checkout in `setup` mode, as in 5.2.
- **Deposit > 0:** Checkout in `payment` mode for the deposit, with `payment_intent_data.setup_future_usage: "off_session"`. One step charges the deposit *and* saves the card. At close the invoice has the full price plus shipping and a negative line "Deposit paid" for the deposit amount, so the buyer is charged the balance.
- Deposits are **fully refundable** until the batch is charged (cancel button refunds it automatically) and count toward the total afterwards. A non-refundable deposit would be awkward under BC rules and isn't worth it at $5.
- Cost to know about: Stripe keeps its fee on refunded charges, so each refunded $5 deposit costs about $0.45. Taking a deposit also means money is held from the reservation, so the future performance contract rules (13.2) apply from day one; the reservation email already carries the full disclosures, so no extra work.

Options considered:

| Option | Upside | Downside |
| --- | --- | --- |
| **A. Save card now, charge at close** (default) | No money held; no refunds if a batch flops; simple story ("you won't be charged until Dec 15") | Some cards fail at close (expect 3 to 8 %); some reservers flake (no skin in the game) |
| B. Deposit now (say $25), balance at close | Commitment; fewer flakes | Holding money creates a future performance contract from day 1 (13.2); refunds for every flop; two charges per order |
| C. Full payment now | Cash up front | Longest money hold, most refund exposure, most legal weight |
| D. Authorize now, capture later | Feels like A with a guarantee | Card authorizations expire after about 7 days, far shorter than a batch. Not viable. |

### 5.2 Reserving (Stripe Checkout, setup mode)

1. Buyer signs in (7.1), picks quantity, enters shipping address (our form; Canada only), accepts terms (versioned checkbox, required) and optionally ticks marketing consent (separate, unticked, 12.2).
2. Server creates the `order` row in `pending_card`, a Stripe **Customer** (stored on `user.stripe_customer_id`, reused next time), and a **Checkout Session** with `mode: "setup"`, `currency: "cad"`, `customer`, `setup_intent_data.metadata.order_id`, success and cancel URLs. Setup mode runs any 3-D Secure check now, with the buyer present, and records consent for off-session charges later. Checkout keeps card data off our servers (PCI SAQ A).
3. Checkout redirects back to `/orders/<number>?saved=1`. The **webhook** (`checkout.session.completed`, then `setup_intent.succeeded`) is what moves the order to `reserved` and stores the payment method id; the redirect just shows a spinner until it lands.
4. Reservation-confirmed email (11).

Capacity race: a reservation holds a spot from the moment the order row is created, for 30 minutes while `pending_card`. Spots are counted as `reserved + pending_card (fresh)`. Pending rows older than 30 minutes stop counting and are swept on the next read.

Wording on the button and the Checkout page (`custom_text.submit.message`): "You won't be charged now. We'll charge CA$X when batch 3 closes (about Dec 15) and email you first."

### 5.3 Charging at close (Stripe Invoices, default)

On **Close and charge**, for each `reserved` order, with an idempotency key `close:<batch>:<order>`:

- Create an **Invoice** for the customer: one line for the light(s), one for shipping, `automatic_tax: { enabled: true }`, `collection_method: "charge_automatically"`, `default_payment_method` = the saved one, metadata `order_id`. Finalize and pay.
- `invoice.paid` → order `paid`, email receipt (Stripe's invoice PDF + our order summary, which doubles as the contract copy, 13.2).
- `invoice.payment_failed` or `invoice.payment_action_required` → order `payment_due`, `payment_due_at` = now + 72 h, email with the **hosted invoice page** link, where they can retry or use another card. Reminder at 24 h left (sent when admin opens the batch page, or by cron on Pro).

Why Invoices rather than bare PaymentIntents: a hosted pay page for failures, 3-D Secure handling, PDF receipts and tax lines for free, at 0.4 % per paid invoice (about $0.58 on $144). The PaymentIntent route (Tax Calculation API + `off_session: true` PaymentIntent + our own retry page) saves the 0.4 % but is a lot more code. Recommend Invoices.

Charging 25 orders sequentially from one server action takes a few seconds, well inside a Vercel function limit. The action is resumable: it only touches orders still `reserved`, so pressing it again after a timeout is safe.

Stripe's card account updater refreshes many expired or reissued cards on its own, which helps when a card was saved weeks earlier.

### 5.4 Refunds and disputes

- Refund from admin: full (default) or partial, with a reason. Creates a Stripe Refund on the invoice's charge; `charge.refunded` updates the order and sends the refund email. BC wants refunds within 15 days of a valid cancellation (13.2); the admin list flags any cancellation older than 5 days without a refund.
- `charge.dispute.created` → order flagged, Adam emailed. Disputes cost a fee (about $15) whether won or lost, another reason for the generous cancellation rule.

### 5.5 Webhook

`POST /api/stripe/webhook`, raw body, signature checked with `STRIPE_WEBHOOK_SECRET`. Every event id is inserted into `stripe_event` first (primary key, so repeats are no-ops). Handlers are small, idempotent and keyed by `metadata.order_id`. Events: `checkout.session.completed`, `setup_intent.succeeded`, `setup_intent.setup_failed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `charge.dispute.created`, `customer.updated`.

### 5.6 Stripe account and keys

- Account in Adam's name as a **sole proprietor** in Canada (or his company, Q11), CAD payouts.
- Statement descriptor `BZZY.CA`.
- Env vars: `STRIPE_SECRET_KEY` (restricted key), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CURRENCY=cad`. Test-mode keys in Preview, live keys in Production only.
- Fees on a CA$129 + $15 order: about 2.9 % + $0.30 card fee (≈ $4.48; more for non-Canadian cards) + 0.4 % invoicing (≈ $0.58). Stripe Tax is free where you aren't registered (6.1).

## 6. Tax and shipping

### 6.1 Sales tax

- **Small supplier:** a Canadian business under CA$30,000 of taxable sales in the last four quarters doesn't have to register for GST/HST. Twenty-five lights at $129 is about $3,200 a batch, so Adam is likely well under for a while. **BC PST** has a similar small-seller exemption for low BC sales (check the current figure with the BC PST guide).
- Unregistered sellers **must not** charge GST/HST/PST. Prices are shown as "no sales tax charged" (or just the price).
- **Wire Stripe Tax from day one anyway** with no registrations: tax comes out $0, it costs nothing, and Stripe's threshold monitoring warns when registration is near. Adding a registration later flips tax on with no code change, and Stripe then charges 0.5 % (dashboard) or $0.50 per transaction (API).
- When registered, the destination decides the rate: GST 5 %, HST 13 % (ON) or 15 % (Atlantic), BC sales add PST 7 %, and QC, MB and SK have their own rules for out-of-province sellers. Stripe Tax handles the maths; Adam (or an accountant) handles registrations and filing.
- Voluntary GST registration lets Adam claim back GST paid on parts but means charging GST to buyers. Ask the accountant (Q12).
- Product tax code: general tangible goods (`txcd_99999999`).

### 6.2 Shipping

- **Flat rates by region** (default): BC CA$12, rest of Canada CA$18 per order (1 to 3 lights fit one small box). Stored on the batch so they can change.
- Canada Post **Tracked Packet** or **Expedited Parcel** via a Solutions for Small Business card (free, gives discounts). A packed bzzy should be under 500 g.
- Address validation: Canadian postal code format check and province list. No PO boxes rule needed for Canada Post.

### 6.3 International (default: Canada only; Q4)

- **US:** the US ended its US$800 duty-free de minimis for all countries on 2025-08-29, and Canada Post only takes US-bound parcels with duties prepaid (via its Zonos integration). A Canadian-assembled light with Chinese parts likely doesn't qualify as CUSMA-originating, and US tariff rules have shifted repeatedly in 2026. Plus FCC (13.4). Doable later with DDP pricing; not for batch 1.
- **Elsewhere:** CE/UKCA radio and safety rules, VAT/IOSS. Not planned.

## 7. Accounts, pre-pairing and teams

### 7.1 Buyers need a bzzy account

A light has to belong to someone, so the buyer signs in before reserving. Today sign-up is GitHub, or a passkey only from a live team invite. Buyers aren't developers, so:

- **Default:** add the Auth.js **Resend email provider** (magic link). It verifies the email we'll send order mail to, and reuses the Resend setup we already have. Passkey stays the recommended second step on the order page ("Add a passkey for next time").
- Alternative: let a passkey sign-up through when it carries a live reservation token, the same way `/join` gates on an invite (`auth.ts`). Less code, but no verified email. See Q8.
- Email-only sign-ups get `emailVerified` from the provider; their personal team is created by `ensurePersonalTeam` as today.

### 7.2 Pre-paired at the bench

Today a new light shows a QR code to `/pair/<code>`, and whoever claims it picks a team (`lib/pairing.ts`). For built lights:

1. Adam builds a light, flashes current firmware over USB, and joins it to his workshop Wi-Fi.
2. It shows its pairing QR. Adam (superadmin) opens it. The pair form gains an **Assign to order** picker (orders in `building` that still need lights). Picking one creates the device with `owner_user_id` = buyer, `team_id` = buyer's personal team, name "bzzy", and sets `order_unit.device_id`.
3. Adam runs QA (11.3 checklist) and burns it in: the light polls as the buyer, so the buyer could already watch it live. The order page says "Your light is built and tested".
4. **Prepare to ship** (admin, per light): sets `device.ship_mode`. On its next poll the light gets `ship: true`, forgets the saved Wi-Fi but **keeps its device id and token**, shows "Packed. Plug me in at your desk." and dims. (New firmware feature `ship`; see 15, PR 5.)
5. At the buyer's desk: no Wi-Fi saved, so it opens `bzzy-XXXX` setup (existing flow), they pick their Wi-Fi, and because it already has an id and token it goes straight to their status. The first successful poll from a new IP clears `ship_mode`, sets `order.delivered_at` if unset, and sends the "It's alive" email.

Without the firmware feature, step 4 can be done by holding the top button at power-on (opens setup, which already keeps id and token), so batch 1 isn't blocked on firmware; the setup card just needs a line saying so.

### 7.3 Gifts and company orders

- **Gift:** shipping name/address can differ from the buyer. The light still belongs to the buyer. A later **Transfer light** action (device owner emails a claim link; the recipient signs in; the device moves to their personal team) covers gifts. Q9.
- **Company orders** (Adam's office!): an order can optionally name a team the buyer administers. Lights are then created in that team with `push_team_id` set, owner = buyer until each person claims theirs by transfer. Out of scope for v1 beyond the field; quantities over 3 go through the contact form.

## 8. Data model and migrations

Drizzle, in `app/src/db/schema.ts`; migrations continue from `0015`. Money is integer cents, currency `cad`. All tables get `created_at`.

### 0016_commerce_core

Built for more than one product from the start (Adam, 2026-11-18: "no options yet, but plan for it, and additional products possibly"). v1 has one product with one variant, and the UI hides the pickers while that's true.

```ts
// Something Adam sells: "bzzy, built", later maybe "bzzy kit", "desk stand".
product: id, slug (unique), name, description, active, sort,
  kind ("light" | "accessory" | "kit"),  // "light" units go through pairing (7.2)
  max_per_order (3), stripe_tax_code

// A buyable version of a product: colour, ring diffuser, etc. Every product has at
// least one ("default"). Price lives here and is edited in admin (10.6).
product_variant: id, product_id, sku (unique, "BZ-BLK"), name ("Black"),
  options jsonb { case: "black", ring: "frosted" },
  price_cents, weight_grams, active, sort,
  bom_key text   // which BOM in lib/commerce/bom.ts builds it (10.2)

// Every price change, for the record and for "price was X when you reserved".
price_change: id, variant_id, old_cents, new_cents, by_user_id, at

batchStatus = enum(draft, open, charging, funded, building, shipping, done, cancelled)
batch: id, number (serial, "Batch 3"), name, status,
  min_to_build,                    // across all items
  deposit_cents (0),               // 5.1; editable while draft
  shipping_rates jsonb { "BC": 1200, "default": 1800 },

// What a batch offers. Price copied from the variant when added, editable while
// the batch is draft/open; orders snapshot it again (order_item.unit_price_cents).
batch_item: id, batch_id, variant_id, price_cents, capacity, spares (2)
  unique (batch_id, variant_id)
  opens_at, closes_at, ships_by (date),             // ships_by = the supply date
  ships_by_original (date), delay_reason,
  payment_window_hours (72), parts_ordered_at, parts_arrived_at,
  closed_at, done_at, notes (admin only)

orderStatus = enum(pending_card, reserved, payment_due, paid, released,
  building, ready, shipped, delivered, cancelled, refunded)
order: id, number (unique, "BZ-0042"), user_id, batch_id, team_id null (7.3),
  status,
  subtotal_cents, shipping_cents, tax_cents, total_cents,
  deposit_cents, refunded_cents,
  ship_name, ship_phone, ship_address jsonb { line1, line2, city, province, postal, country },
  is_gift bool,
  stripe_checkout_session_id, stripe_setup_intent_id, stripe_payment_method_id,
  stripe_invoice_id, stripe_charge_id,
  terms_version, terms_accepted_at, accepted_ip_hash,
  reserved_at, charged_at, payment_due_at, paid_at, cancelled_at, cancel_reason,
  shipped_at, delivered_at
  index (batch_id, status), index (user_id)

// Lines on an order. v1: one line, quantity 1 to 3. Price is the snapshot at
// reservation; later price edits never change it.
order_item: id, order_id, batch_item_id, variant_id, quantity, unit_price_cents

// One row per physical light (items of kind "light"), so 3-light orders track each unit.
order_unit: id, order_id, order_item_id, serial (unique, "BZ3-07"), device_id null -> device.id (set null),
  firmware_version, qa jsonb { leds, screen, touch, button, wifi, burnInHours },
  built_at, ready_at

shipment: id, order_id, carrier ("canadapost"), service, tracking_number,
  label_cost_cents, shipped_at, delivered_at

// Append-only timeline: the order page and admin both read it. Also legal proof
// that notices were sent.
order_event: id, order_id, at, actor ("user:<id>" | "admin:<id>" | "stripe" | "system"),
  type (reserved, charged, payment_failed, delay_notice, email_sent, refunded, ...),
  data jsonb

stripe_event: id (Stripe evt_ id, PK), type, received_at, processed_at, error

user: + stripe_customer_id text unique
device: + ship_mode bool default false, + order_unit_id null
```

### 0017_marketing_consent

```ts
// CASL proof. Append-only: a withdrawal is a new row, never an update.
consent_event: id, email (lower-cased), user_id null, topic ("batches" | "news"),
  action ("granted" | "withdrawn"), source ("reserve_form" | "notify_form" |
  "settings" | "resend_unsubscribe" | "admin"), wording (exact text shown),
  wording_version, ip_hash, user_agent, at

// Current state, derived from the events; mirrors Resend contact topics.
email_subscription: email PK, user_id null, batches bool, news bool,
  confirmed_at (double opt-in click), resend_contact_id, updated_at

// "Tell me when the next batch opens" without an account.
batch_interest: id, email, quantity, province, created_at, notified_batch_id null
```

Retention: orders and order events kept 7 years (CRA record-keeping). Consent events kept for as long as we email the person plus 3 years. Shipping addresses masked in admin lists after delivery + 1 year (privacy, 13.7).

## 9. Pages

### Public (bzzy.ca)

- **Landing:** a new "Get one built" section under the device section: photo, price, "Batch 3: 14 of 25 reserved · closes Dec 15 · ships by Jan 26", Reserve button. When no batch is open: "Next batch opens soon" and the notify form. Note that the DIY path stays front and centre (the repo, the build guide), since that's the project's heart.
- **`/buy`**: product detail, what's in the box (light, USB-C cable, quick-start card; no power adapter), how batches work (a 4-step strip: reserve, batch closes and you're charged, built and paired to you, shipped), FAQ, current batch, Reserve.
- **`/buy/reserve`**: signed in. Quantity, shipping address, terms checkbox, separate marketing checkbox, summary with "Charged at close: CA$X", Continue to Stripe.
- **`/orders/[number]`**: owner only. Status timeline from `order_event`, ship-by date, light(s) with live preview once paired (reuses `device-preview.tsx`), tracking link, actions: cancel, update card (Stripe Customer Portal or a new setup session), pay now (when `payment_due`), download receipt.
- **`/settings` → Orders card** listing the user's orders, and **Email** card with the two marketing topics.
- **Legal pages:** `/terms` (sale terms, versioned), `/privacy`, `/shipping-returns`, `/warranty`. Footer links on every page.

### Design notes

- Built on the existing landing kit (dark, bronze, SUSE) for public pages and the app shell for order pages.
- Every money figure says "CAD". The ship-by date is always visible near the price.
- Phone-first for `/buy` and order pages.

## 10. Admin and fulfilment

All under `/admin` (superadmin only, existing `lib/admin.ts` check).

### 10.1 Batches

`/admin/batches`: list with status, counts per order state, money totals. Create/edit batch (draft), **Open**, **Close and charge** (confirm dialog shows count and total), **Release unpaid** (orders past their payment window), **Build anyway / Extend / Cancel batch** when under minimum, **Set new ship-by date** (sends delay notices, 4.2), **Mark parts ordered / arrived**, **Mark building**.

### 10.2 Parts list

On a funded batch: lights to build = sum of paid quantities, plus a spare setting (default +2). The page multiplies a per-unit BOM (main board PCBA, display panel, antenna, case parts by STL, button cap, cable, box, insert card) and links to each supplier, so ordering is a checklist. The BOM lives in `app/src/lib/commerce/bom.ts`, not the database, since it changes with hardware revisions (main board rev A, B, ...).

### 10.3 Build station

`/admin/batches/[id]/build`: one row per order unit with serial, assigned device, QA checkboxes, firmware version, last poll. Pairing from 7.2 lands here. **Prepare to ship** per unit, **Mark ready** per order.

### 10.4 Shipping

- **Export CSV** of ready orders in Canada Post's EST / Snap Ship import format; Adam buys labels in Canada Post's tool.
- **Paste tracking numbers** back (bulk field: `BZ-0042, 1234567890123456`). Each one sets the shipment, moves the order to `shipped` and sends the shipped email.
- Later: Canada Post API (needs a commercial agreement) or a broker like Stallion Express / Chit Chats, for label buying in the app.
- Delivery: marked by the light's first poll (7.2) or manually.

### 10.5 Orders

`/admin/orders/[number]`: everything about the order, the event timeline, buttons for cancel, refund (full/partial), move batch, resend any email, edit address (until shipped), add a note. Search by number, email or name.

### 10.6 Products and prices

`/admin/products`: create and edit products and variants (name, description, photos via Vercel Blob, SKU, options, weight, active). **Price is an editable field on each variant.** Editing it:

- logs a `price_change` row;
- asks whether to apply the new price to the **open/draft batch** too (default yes for draft, ask for open);
- never changes existing orders, which keep their reserved price. If Adam *lowers* the price of an open batch, a checkbox offers to lower existing reservations too (the buyer is emailed). Raising it for existing reservations isn't offered: they agreed to a price.

Shipping rates and the deposit are edited on the batch. Per-order limit on the product.

### 10.7 Dashboard tiles

On `/admin`: open batch progress, orders needing action (payment due, cancellation awaiting refund > 5 days, disputes, webhooks failing), revenue this year vs the CA$30k GST threshold.

## 11. Email: transactional

Sent with the existing `lib/mail.ts` (Resend, `bzzy <orders@bzzy.ca>` via `MAIL_FROM`-style setting `ORDER_MAIL_FROM`, Reply-To `hello@bzzy.ca`), templates in `lib/mail-templates.ts` with the shared layout, each logged as an `order_event`. Idempotency keys `order:<id>:<type>` so retries never double-send.

| # | Email | Trigger | Must include |
| --- | --- | --- | --- |
| 1 | Sign-in link | magic link | |
| 2 | Spot reserved | `setup_intent.succeeded` (or deposit `checkout.session.completed`) | batch, quantity, price, deposit paid (if any), shipping, est. charge date, **ship-by date**, cancel link, terms link (version) |
| 3 | Batch closes in 3 days | admin opens batch page / cron | amount, card ending, cancel link |
| 4 | Charged (receipt + contract copy) | `invoice.paid` | everything BC requires in a distance-sales contract (13.2): seller name/address/phone/email, item description, itemized price, tax, shipping, total, currency, ship-by date, cancellation/refund/return policy. Invoice PDF link. |
| 5 | Payment didn't go through | `invoice.payment_failed` / `action_required` | pay link (hosted invoice), deadline |
| 6 | Last call: 24 h to pay | when ~24 h left | |
| 7 | Spot released | window ended | rejoin link |
| 8 | Batch delayed | new ship-by date | new date, reason, one-click cancel + full refund |
| 9 | Batch didn't fill | below min | choose: next batch or cancel |
| 10 | Your light is built | order `ready` | photo optional, "it's already in your account" |
| 11 | Shipped | tracking added | tracking link, setup steps (Wi-Fi only) |
| 12 | It's alive | first poll from buyer | tips: calendar, GIFs, working hours |
| 13 | Cancelled / refunded | cancel or refund | amount, 5 to 10 business days to card |
| 14 | Admin alerts (to Adam) | reservation, payment failure, dispute, webhook errors | |

All transactional emails include the bzzy name, mailing address and a link to email settings in the footer. They don't need marketing consent (12.1), but they also never carry promotions.

## 12. Email: marketing and CASL

### 12.1 What CASL needs

Canada's Anti-Spam Legislation applies to every **commercial electronic message** (anything encouraging buying, like "Batch 4 is open").

- **Consent.** Express consent: an **unticked** checkbox (or a separate form), with plain wording saying who is asking and what for, and that they can withdraw at any time. Not bundled with accepting the terms. Implied consent also exists (a purchase gives 2 years, an inquiry 6 months), but default to express consent only: it never expires and is simple to prove.
- **Every message** names the sender (bzzy / Adam Glover), gives a **mailing address** and a way to contact (email or web), and has an **unsubscribe** that works without signing in and is honoured within 10 business days (we do it immediately).
- **Proof.** Keep a record of how and when each consent was given (the `consent_event` table: exact wording, timestamp, source, IP hash).
- Messages that only confirm or deliver a transaction already agreed to (order updates, receipts, safety and warranty notices) are exempt from the consent requirement.
- Penalties are large on paper (up to $1M for individuals), and the CRTC acts on complaints, so the paper trail matters.

### 12.2 Where consent is asked

- `/buy/reserve`: unticked "Email me when new batches open and about new bzzy features. You can unsubscribe at any time. — bzzy (Adam Glover), Vancouver, BC".
- Landing "Notify me" form (no account): email + same wording; sends a confirmation email (double opt-in). CASL doesn't require double opt-in, but it proves the address is theirs and keeps lists clean.
- `/settings` → Email: toggle each topic.

### 12.3 Resend setup

Resend's contacts model (since late 2025): **Contacts** are global, **Segments** group them for targeting, **Topics** are what people subscribe to or leave. Plan:

- Topics: `batches` ("New batch announcements") and `news` ("bzzy news and features"), both opt-in (default unsubscribed).
- Segments: `buyers`, `interest-list`, maybe by province later.
- The app is the source of truth. On every consent change, upsert the Resend contact and its topic subscriptions (`lib/marketing.ts`).
- Resend **webhook** `contact.updated` → `/api/resend/webhook` (signed with Resend's Svix-style secret, the same Standard Webhooks scheme our own webhooks use) writes a `withdrawn` consent event when someone unsubscribes from Resend's page.
- Broadcasts are written and sent from the Resend dashboard (or by Claude through the Resend connector, on Adam's say-so), always with a Topic and Resend's unsubscribe placeholder. The broadcast footer carries the mailing address.
- "Batch 4 is open" goes to topic `batches` **plus** `batch_interest` rows (who asked to be told about the next batch; a one-time transactional reply to their request).
- Check the Resend plan's contact and broadcast limits before the list grows (the account also hosts Porus and adamglover.net).

## 13. Legal and operations

A checklist, ordered by what blocks selling. Each item says how sure this spec is.

### 13.1 Business basics

- **Sole proprietorship** in BC is the default. Trading as "bzzy" (not his own name) needs a **BC business name registration** via BC Registries. Or sell through an existing company (Q11).
- Business bank account, bookkeeping (Stripe exports), income tax on profit.
- **Product liability insurance**: strongly recommended once selling to strangers; ask a broker about a small electronics maker policy.
- **Mailing address** for CASL footers, invoices and the BC contract disclosure: a PO box or virtual mailbox, since it becomes public (Q10).
- Trademark: quick CIPO and USPTO search for "bzzy" before printing boxes.

### 13.2 BC consumer protection (pre-orders)

Under BC's Business Practices and Consumer Protection Act (amended; most changes in force since 2026-08-01):

- An online order is a **distance sales contract**. Before the buyer commits we must show the required disclosures (seller name, address, contact, description, itemized price, shipping, taxes, total, currency, **supply date**, cancellation, return and refund policies) and give a **copy of the contract within 15 days**. Email 4 does this; email 2 also does for the reservation.
- If goods aren't delivered within **30 days after the supply date**, the buyer may cancel; we must refund **in full within 15 days** of their notice. If no supply date was given, it's 30 days from the contract. If the refund doesn't come, card issuers must reverse the charge.
- The 2026 amendments widened **future performance contracts** to cover goods delivered later where the total is over $50, with their own disclosure rules and a long cancellation window (reported as up to one year) if required information is missing. A paid-but-not-shipped bzzy order is likely one. Practical effect: the disclosures must be complete, every time, which the templates enforce.
- Certain contract terms are now void in BC consumer contracts (for example terms that stop people posting reviews, or that limit liability for things the law says you can't). Keep the terms short and plain.
- **Ask a BC lawyer to review** the terms page, the order and receipt emails, and the delay/cancel flow once drafted. That's a one-off review of 4 or 5 short documents.

Pay-at-close helps: until the charge, nothing has been paid, and the reservation terms can say plainly that either side may walk away.

### 13.3 Product safety and labelling (Canada)

- **Canada Consumer Product Safety Act:** general duty not to sell a product that's a danger to health or safety; **report incidents** to Health Canada within 2 days of learning of one; keep records of where parts came from and who you sold to. The order system covers the "sold to" part.
- **Consumer Packaging and Labelling Act:** prepackaged consumer products need product identity in **English and French** and the dealer's name and address. A bilingual box label/insert card handles it.
- **Electrical safety:** the light runs on 5 V USB. Low-voltage USB devices are generally outside provincial electrical-approval rules; don't ship a wall adapter (or ship a certified one). LED current is capped in firmware (250 mA cap planned). Battery: none.

### 13.4 Radio certification (ISED, and FCC for the US)

Selling a Wi-Fi device in Canada needs the radio to be **ISED-certified and listed on ISED's Radio Equipment List**. No small-quantity exemption was found. There are two cases:

1. **The radio part is already certified** (a certified module or board). Then the host product can rely on it if used per the grant's conditions (same antenna, no firmware power changes beyond limits), with a label "Contains IC: XXXXX-YYYY". The host still needs **ICES-003** (digital apparatus emissions) compliance, which is a self-declaration backed by testing, and the label statement.
2. **It isn't.** Then the whole product needs certification by an ISED-recognised certification body. Expect several thousand dollars and weeks.

**Decided (2026-11-19):** Adam confirmed the Waveshare ESP32-S3-Touch-LCD-1.69 has **no ISED certification**, so it stays a dev/DIY board and is never sold built. Sold lights use the **custom bzzy main board** (spec in `docs/hardware/main-board.md`, PR #82) on the certified **ESP32-S3-WROOM-1U-N16R8** module (IC `21098-ESPS3WROOMU`, FCC ID `2AC7Z-ESPS3WROOM1U`) with an antenna of the certified type and gain. That is case 1 above.

What's left before batch 1:

- **ICES-003 Class B** emissions test of the finished light at a lab (estimate CA$2k to 5k; get quotes), then the product label: "Contains IC: 21098-ESPS3WROOMU" and the ICES-003 statement, bilingual.
- US later: FCC Part 15B SDoC (needs a US responsible party) and "Contains FCC ID" label.
- Batch 1 therefore waits on main board rev A prototypes and the lab test. The batch system can be built and tested in Stripe test mode meanwhile.

### 13.5 Warranty

- BC's Sale of Goods Act implies the product is of merchantable quality and fit for purpose; that can't be excluded for consumers.
- Default: **1-year limited warranty** on top: repair, replace or refund for defects; buyer ships it back (we pay for defects); excludes physical damage and modified hardware/firmware... except that custom firmware is the point of an open project, so say "we may ask you to reflash official firmware before a claim".

### 13.6 Returns

- Default: **30 days from delivery** for change of mind, light in working condition, buyer pays return shipping, full refund of the light (shipping not refunded). Defects: we pay both ways. See Q7.
- Returned lights get factory-reset (device row deleted, which makes the light forget its id via the existing 3 × 401 rule) and become spares.

### 13.7 Privacy

- BC's **PIPA** covers personal information collected by a BC business (federal PIPEDA when it crosses provinces). We collect name, email, shipping address, phone (for the carrier). A privacy page says what, why, who we share with (Stripe, Resend, Canada Post, Vercel, Neon), retention (8), and how to ask for access or deletion.
- Card data never touches our servers (Stripe Checkout and hosted invoices).
- Data is stored in the US (Vercel, Neon, Resend us-east-1); say so on the privacy page.

### 13.8 Licences

- Code is PolyForm Noncommercial and the hardware is CC BY-NC-SA, both licensed **by Adam**, so Adam can sell; other people can't sell copies. Good.
- **Before accepting outside contributions**, add contributor terms (a short CLA or a DCO plus a licence grant to Adam) so contributed code doesn't end up only under the noncommercial licence, which would stop Adam using it in what he sells. Today all commits are Adam's (and Claude's on his behalf), so nothing to fix retroactively.
- The `bzzy` name and logo stay Adam's; say so in the README (trademark line).

## 14. Platform changes

### 14.1 Vercel Pro

Vercel's Hobby plan is for **non-commercial personal use only**. Taking payments is commercial, so move the `bzzy` project to **Pro** (US$20/month per member) before the first live Stripe charge. Pro also brings cron jobs, longer function limits and more build minutes. Neon free may also become tight once traffic grows; review after batch 1.

### 14.2 No cron (until Pro)

Time-based work in this design is small and can run **lazily**: when any admin page or the order page loads, a cheap sweep handles due items (release expired payment windows, send the 24 h reminder, flag 5-day-old unrefunded cancellations). Because Adam acts at every batch step, nothing important depends on a timer. On Pro, add one daily cron that runs the same sweep.

### 14.3 New env vars

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `ORDER_MAIL_FROM` (default `bzzy <orders@bzzy.ca>`), `COMMERCE_ENABLED` (feature flag: hides `/buy` and the landing section until launch).

### 14.4 Caching

Order and admin pages are dynamic and never cached. The landing batch progress (counts) is cached with a `batch` tag and expired on every order state change, following `docs/caching.md`. Nothing changes the device poll path except the `ship` field (7.2), which rides on the existing device tag.

## 15. Build plan

Each PR is small enough to review in one sitting. Nothing goes live until PR 7.

| PR | Contents | Migration |
| --- | --- | --- |
| 1 | Schema core, products, variants and prices admin, batch admin (create/open/edit, deposit), feature flag, Stripe client + webhook route with `stripe_event` | 0016 |
| 2 | Email sign-in (Resend provider), `/buy`, `/buy/reserve`, Checkout setup mode, order page, emails 1 to 2, cancel before charge | |
| 3 | Close and charge with Invoices, payment due flow, release, delay and below-minimum flows, emails 3 to 9 | |
| 4 | Fulfilment: parts list, build station, assign-to-order pairing, shipping CSV + tracking paste, emails 10 to 13 | |
| 5 | Firmware `ship` feature + "It's alive" detection | |
| 6 | Marketing consent, notify form + double opt-in, settings Email card, Resend topics sync + webhook | 0017 |
| 7 | Legal pages, landing section, Vercel Pro, live keys, end-to-end test batch with test cards, then launch | |

Testing: unit tests for the state machines (pure functions, like `team-rules.ts`), Stripe test clocks and test cards (`4000 0000 0000 0341` for a card that saves then fails, `4000 0027 6000 3184` for 3-D Secure), Stripe CLI to replay webhooks, and one real CA$1 batch with Adam as buyer before launch.

## 16. Open questions

Decided by Adam on 2026-11-18:

- **Q1 payment:** save card, charge at close, with an optional small deposit per batch (e.g. $5). Done in 5.1.
- **Q2 batch size:** min 10, cap 25 (+2 spares).
- **Q3 price:** CA$129 + shipping, editable in admin. Done in 10.6.
- **Q4 shipping:** Canada to start.
- **Q6 products:** one product, no options yet, but the data model plans for variants and more products. Done in 8.

Still open. Each has the default this spec uses.

| # | Question | Default in this spec |
| --- | --- | --- |
| Q1b | Deposit: refundable until the batch charges (as written), and should batch 1 have one? | Refundable; batch 1 with no deposit |
| Q5 | Radio certification: resolved by the custom main board on WROOM-1U (13.4). Remaining: get ICES-003 lab quotes | Quotes once rev A prototypes exist |
| Q7 | Cancellation and returns: full refund any time before shipping, 30-day change-of-mind returns? | Yes to both |
| Q8 | Buyer sign-up: email magic link (new), or passkey via reservation token? | Magic link |
| Q9 | Gifts / transferring a light to someone else: needed in v1? | Gift address yes, transfer later |
| Q10 | Mailing address for CASL and invoices (PO box?) | Needed before launch |
| Q11 | Sell as a sole proprietor, register "bzzy" as a business name, or through an existing company? | Sole prop + BC name registration |
| Q12 | Accountant: register for GST voluntarily, or stay a small supplier? | Stay unregistered; Stripe Tax monitoring on |
| Q13 | Ship-by budget: close + 6 weeks realistic for parts and building? | Yes, tune after batch 1 |
| Q14 | Warranty length | 1 year limited |
| Q15 | Should company orders (several lights into one team, e.g. your office) be in v1? | No, contact form; field reserved |
| Q16 | Which hardware ships in batch 1? | Custom main board rev A or later (Waveshare + ring stays DIY only) |
| Q17 | Who sends marketing: you from the Resend dashboard, or Claude through the Resend connector on your say-so? | Either; always with a Topic |
| Q18 | Insurance: get a quote before launch? | Yes |

## Sources checked (2026-11-19)

- Consumer Protection BC: distance sales cancellation (30 days after supply date, 15-day refunds), and guidance on the 2026 BPCPA changes (in force 2026-08-01, future performance contracts over $50).
- Stripe docs: Stripe Tax Canada (CA$30k federal threshold, monitoring, 0.5 % / $0.50 pricing only where registered).
- Resend docs: Audiences → Segments migration, Topics for unsubscribes, broadcast unsubscribe placeholder.
- Canada Post / CFIB: US de minimis suspension from 2025-08-29, duties-prepaid US parcels.
- Waveshare product pages (ESP32-S3R8 chip, onboard antenna) and the FCC ID listing `2BNXN-2502ESP32` (non-touch board).
- Espressif ISED certificates for WROOM/MINI modules (modular approvals).
