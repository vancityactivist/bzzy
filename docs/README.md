# bzzy docs

Start with [plan.md](plan.md) for where things are going, and the [root README](../README.md) for what bzzy is and the build log.

## Plan

| Doc | What it covers |
|---|---|
| [plan.md](plan.md) | The step-by-step plan from here to the first batch, the business steps alongside it, and loose ends |

## Hardware

| Doc | What it covers |
|---|---|
| [hardware/main-board.md](hardware/main-board.md) | **The product board.** Spec for the merged custom board: ESP32-S3-WROOM-1U, ER-TFT1.69-4 screen, power, layout, pins, BOM and cost, JLCPCB, ICES-003 certification, case impact, open questions |
| [s3-devkit-bench-test.md](s3-devkit-bench-test.md) | Bench test of the main board's screen on an ESP32-S3 DevKitC, before the PCB |
| [../hardware/README.md](../hardware/README.md) | The hardware folder: the case, the main board placement study, and the archive |
| [esp32-test-build.md](esp32-test-build.md) | Cheap test build: a classic ESP32 with a 16x2 character LCD |
| [esp32-c6-test-build.md](esp32-c6-test-build.md) | Test build on the Waveshare ESP32-C6-LCD-1.47, no wiring |
| [../hardware/archive/](../hardware/archive/README.md) | **Archived:** the LED ring board (rev C) for the Waveshare board. Never ordered |

## Firmware and device

| Doc | What it covers |
|---|---|
| [protocol.md](protocol.md) | How a light talks to the app: polling, the state it gets back, setup and pairing |
| [ota.md](ota.md) | Signed firmware updates over Wi-Fi from GitHub Releases, rollback, the signing key |

## App and services

| Doc | What it covers |
|---|---|
| [api.md](api.md) | The public API (v1): personal tokens, endpoints, webhooks |
| [caching.md](caching.md) | How device polls are answered from Vercel's runtime cache so the database can sleep |
| [domains.md](domains.md) | bzzy.ca, the redirect domains, DNS |
| [email.md](email.md) | Email through Resend: invites, join emails, the contact form |
| [search.md](search.md) | Search engine setup: robots, sitemap, Google and Bing verification |
| [brand/](brand/README.md) | The logo files and how to use them |
| [../app/README.md](../app/README.md) | Running the app locally |

## Selling built bzzys

| Doc | What it covers |
|---|---|
| `commerce/batch-orders.md` | Spec for batch ordering (draft PR #81, not on `main` yet): deposits, charging at close, batch sizes, pricing, Canada only |
