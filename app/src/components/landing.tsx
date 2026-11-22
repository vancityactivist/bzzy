import Image from "next/image";

import caseBack from "@/assets/case-back.png";
import caseExploded from "@/assets/case-exploded.png";
import caseFront from "@/assets/case-front.png";
import caseTop from "@/assets/case-top.png";
import heroRender from "@/assets/hero.jpg";

import { defaultPreviewSrcs } from "@/lib/gifs";
import { SHOP_URL, type ShopBatch } from "@/lib/shop-batch";
import type { Status } from "@/lib/protocol";
import { viewFor, withShow } from "@/lib/screen";

import { BzzyMark } from "./brand";
import { DevicePreview } from "./device-preview";
import { CalendarIcon, DeviceIcon, LinkIcon, UsersIcon } from "./icons";
import { LandingContact } from "./landing-contact";
import { LandingHeroDevice } from "./landing-hero";
import { BatchLine, BuySection } from "./landing-shop";
import { CalendarSketch, StatusPickerSketch, TapSketch } from "./landing-illustrations";
import { STATUS_META } from "./status-meta";
import { buttonClass, StatusDot } from "./ui";

import "./landing.css";

// The signed-out home page, on the site's one system (Console, app/tokens.css) and the app's own
// controls. It owns the whole screen: app/(app)/layout.tsx gives every other page the app's
// header, and the home page only adds it when someone is signed in.
//
// Shape: Narrative Workflow. The hero (Banner) holds the live light and two ways to get one;
// the render of the case starts above the fold; then the four statuses, four numbered stages
// (set it, connect calendars, give it a GIF, put it on Wi-Fi), the specs, getting one built
// (the shop's live batch), the build held beside the exploded case, the contact form, and a
// statement footer.

const REPO = "https://github.com/vancityactivist/bzzy";
const HARDWARE = `${REPO}/tree/main/hardware`;
const ORDERING = `${REPO}/tree/main/hardware#ordering-from-jlcpcb`;
const FIRMWARE = `${REPO}/tree/main/firmware`;
const PROTOCOL = `${REPO}/blob/main/docs/protocol.md`;
const LICENSE = `${REPO}/blob/main/LICENSE.md`;

const BUY_ACTION = "Get one built";
const BUILD_ACTION = "Build your own";

const STATUS_ROWS: { status: Status; name: string; use: string }[] = [
  { status: "free", name: "Free", use: "Come over. Questions welcome." },
  { status: "busy", name: "Busy", use: "Working or on a call. Interrupt if it matters." },
  { status: "dnd", name: "Do not disturb", use: "Heads down. Save it for later." },
  { status: "away", name: "Away", use: "Not at your desk, or not in today." },
];

// The built light. The DIY build has the same screen and ring on a Waveshare board (noted under the list).
const SPECS: { term: string; detail: string }[] = [
  { term: "Screen", detail: "1.69 in colour touch, 240 × 280" },
  { term: "Board", detail: "bzzy main board, ESP32-S3" },
  { term: "Light", detail: "16 RGB LEDs, frosted border" },
  { term: "Wi-Fi", detail: "2.4 GHz, guest networks fine" },
  { term: "Power", detail: "USB-C" },
];

// How a status reaches the light (README: How it fits together).
const SOURCES: { label: string; sub: string; icon: typeof DeviceIcon }[] = [
  { label: "Phone or laptop", sub: "Tap a status", icon: DeviceIcon },
  { label: "Google Calendar", sub: "Connected", icon: CalendarIcon },
  { label: "iCloud", sub: "CalDAV", icon: CalendarIcon },
  { label: "Outlook and others", sub: "ICS link", icon: CalendarIcon },
  { label: "Your team", sub: "An announcement on every light", icon: UsersIcon },
];

// Calendars bzzy reads (docs/calendars.md): two connect directly, the rest by ICS link.
const CALENDARS: { name: string; how: string; detail: string }[] = [
  { name: "Google Calendar", how: "Connect with Google", detail: "Focus time shows Do not disturb, out of office shows Away." },
  { name: "iCloud", how: "CalDAV", detail: "Sign in with an app-specific password from your Apple account." },
  { name: "Outlook, Fastmail and others", how: "ICS link", detail: "Paste the calendar's private link. No admin approval needed." },
];

const VIEWS = [
  { img: caseFront, alt: "The bzzy case from the front: a black frame with a white light border round the screen", title: "The case", line: "Black, with a frosted border" },
  { img: caseTop, alt: "The top of the case, with the button and the bzzy wordmark", title: "The button", line: "One press changes your status" },
  { img: caseBack, alt: "The back of the case, with the clip that holds it on a monitor", title: "The clip", line: "Hooks over a monitor's top edge" },
];

const NAV = [
  { href: "#light", label: "Statuses" },
  { href: "#ways", label: "Setup" },
  { href: "#calendars", label: "Calendars" },
  { href: "#buy", label: "Buy" },
  { href: "#build", label: "Build" },
];

// Three screens, each a real preview with a popular GIPHY GIF, loaded from GIPHY (their
// terms don't allow keeping copies) and credited in the footer. The animated WebP
// rendition: a quarter of the GIF's weight.
const giphy = (id: string) => `https://media.giphy.com/media/${id}/200w.webp`;
const GIF_SCREENS: { status: Status; gif: string; text: string; show: boolean; label: string }[] = [
  { status: "free", gif: giphy("tXL4FHPSnVJ0A"), text: "", show: false, label: "Free, with a GIF" },
  { status: "busy", gif: giphy("pHZ8BDWQhJrvLmL29M"), text: "Back in 5", show: true, label: "A GIF shown now, with the message Back in 5" },
  { status: "away", gif: giphy("NEvPzZ8bd1V4Y"), text: "Out to lunch", show: false, label: "Away, with a GIF and Out to lunch" },
];

const LINK = "underline decoration-line-strong underline-offset-4 transition-colors duration-150 hover:text-signal-text hover:decoration-current";
const NAV_LINK = "flex h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-subtle hover:text-foreground";

export function Landing({ batch }: { batch: ShopBatch }) {
  const gifs = defaultPreviewSrcs();

  return (
    <div className="lp flex min-h-full flex-col">
      <a
        href="#top"
        className="sr-only rounded-lg bg-signal px-3 py-2 text-sm font-medium text-signal-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav__bar">
          <a className="flex items-center gap-2 text-lg font-medium tracking-[-0.02em]" href="#top">
            <BzzyMark className="size-7 shrink-0" />
            bzzy
          </a>
          <nav className="lp-nav__links" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.href} className={NAV_LINK} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a className={NAV_LINK} href="/sign-in">
              Sign in
            </a>
            {/* On a phone the hero's own button is on the first screen; the bar keeps Sign in. */}
            <a className={buttonClass("primary", "md", "h-11 max-sm:hidden")} href="#buy">
              {BUY_ACTION}
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero (Banner): the head on seven columns, the light itself on five, live. */}
        <section className="lp-hero" aria-labelledby="hero-h">
          <div className="lp-wrap lp-grid lp-hero__grid">
            <div className="lp-c1-6">
              {/* A non-breaking hyphen, so "heads-down" never splits across lines. */}
              <h1 id="hero-h">Desk status light for heads‑down work</h1>
              <p className="lead">It clips to your monitor and shows your status in light.</p>
              <div className="lp-hero__actions flex flex-wrap items-center gap-3">
                <a className={buttonClass("primary", "md", "h-12 px-5 text-[15px]")} href="#buy">
                  {BUY_ACTION}
                </a>
                <a className={buttonClass("secondary", "md", "h-12 px-5 text-[15px]")} href="#build">
                  {BUILD_ACTION}
                </a>
              </div>
              <BatchLine batch={batch} />
            </div>
            <div className="lp-c7-12 lp-device">
              <LandingHeroDevice gifs={gifs} scale={0.95} />
            </div>
          </div>
        </section>

        {/* The light in use, close and large (it starts above the fold), then its four statuses as rows. */}
        <section id="light" aria-labelledby="light-h">
          <div className="lp-wrap">
            {/* A render made from the real case CAD; a photo of the first built bzzy can replace it. */}
            <div className="lp-showcase">
              <Image
                src={heroRender}
                sizes="(min-width: 1440px) 1312px, 100vw"
                priority
                alt="A bzzy light clipped to the top of a monitor, its frosted ring glowing red and its screen reading Busy"
              />
            </div>
            <div className="lp-grid mt-30">
              <div className="lp-c1-5">
                <h2 id="light-h">Four statuses on a ring of 16 LEDs</h2>
                <p className="lead">The ring can also pulse, blink, strobe or spin, and flashes a few minutes before each meeting.</p>
              </div>
              <ul className="lp-rows lp-c7-12">
                {STATUS_ROWS.map((r) => (
                  <li key={r.status}>
                    <h3 className="flex items-center gap-3 text-[1.375rem]">
                      <StatusDot status={r.status} size="lg" />
                      {r.name}
                    </h3>
                    <p className="text-muted">{r.use}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Stage 1: three ways to set it, each with the app's own piece. */}
        <section className="lp-wrap" id="ways" aria-labelledby="ways-h">
          <div className="lp-stage">
            <h2 id="ways-h">1. Set your status three ways</h2>
            <p className="lead">A status you set by hand overrides your calendar until its timer ends.</p>
            <div className="lp-panels mt-16">
              <article className="lp-way lp-way--lead">
                <div>
                  <h3>Tap a status on your phone</h3>
                  <p className="mt-3 text-muted">Pick one of four, add a short message and say how long it lasts.</p>
                </div>
                <div className="lp-way__art" role="img" aria-label="The app's status picker with Busy chosen and the message On a call, back at 3">
                  <StatusPickerSketch />
                </div>
              </article>
              <article className="lp-way">
                <div>
                  <h3>Follow your calendar</h3>
                  <p className="mt-3 text-muted">Connect Google or iCloud, or paste an ICS link, and meetings turn the light Busy.</p>
                </div>
                <div className="lp-way__art" role="img" aria-label="A morning calendar with three meetings, and the light's colour changing to match">
                  <CalendarSketch />
                </div>
              </article>
              <article className="lp-way">
                <div>
                  <h3>Tap the light itself</h3>
                  <p className="mt-3 text-muted">A tap steps through the statuses. A long press hands control back to the calendar.</p>
                </div>
                <div className="lp-way__art" role="img" aria-label="A tap on the light's screen steps from Free to Busy to Do not disturb">
                  <TapSketch gifSrc={gifs.free} />
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Stage 2: every calendar, and what happens when they overlap. */}
        <section className="lp-wrap" id="calendars" aria-labelledby="calendars-h">
          <div className="lp-stage lp-grid">
            <div className="lp-c1-5">
              <h2 id="calendars-h">2. Connect every calendar you use</h2>
              <p className="lead">Google and iCloud connect directly. Anything that publishes an ICS link works too.</p>
              <ul className="mt-8 space-y-3">
                <li>Work and personal accounts at once</li>
                <li>Each light can follow its own calendars</li>
                <li>Read-only: bzzy never changes your calendar</li>
              </ul>
            </div>
            <div className="lp-c7-12">
              <ul className="lp-panels m-0 list-none p-0">
                {CALENDARS.map((c) => (
                  <li key={c.name} className="grid gap-2 px-6 py-5">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <h3 className="flex items-center gap-3 text-[1.125rem]">
                        <CalendarIcon className="size-4 shrink-0 text-muted" aria-hidden />
                        {c.name}
                      </h3>
                      <span className="font-mono text-sm text-instrument">{c.how}</span>
                    </div>
                    <p className="text-muted">{c.detail}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-6 rounded-2xl border border-line bg-card px-6 py-5">
                <p className="font-medium">When meetings overlap, the strongest status wins</p>
                <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" aria-label="Away wins over Do not disturb, which wins over Busy">
                  {(["away", "dnd", "busy"] as const).map((st, i) => (
                    <span key={st} className="flex items-center gap-3">
                      {i > 0 && <span className="text-muted" aria-hidden>over</span>}
                      <span className="flex items-center gap-2">
                        <StatusDot status={st} />
                        {STATUS_META[st].label}
                      </span>
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stage 3: a GIF for every status, on four lights. */}
        <section className="lp-wrap" id="gifs" aria-labelledby="gifs-h">
          <div className="lp-stage">
            <h2 id="gifs-h">3. Give each status a GIF</h2>
            <p className="lead">Upload one or paste a GIPHY or Tenor link.</p>
            <ul className="lp-panels lp-panels--3 lp-gifs mt-16">
              {GIF_SCREENS.map((g) => {
                const base = viewFor({ status: g.status, text: g.show ? "" : g.text, until: 0 });
                return (
                  <li key={g.label} className="flex flex-col items-center gap-4 bg-inset! px-4 py-10">
                    <div className="lp-device" role="img" aria-label={g.label}>
                      <DevicePreview
                        view={g.show ? withShow(base, { text: g.text, until: 0, gif: true }) : base}
                        gifSrc={g.gif}
                        gifFit
                        lazy
                        scale={0.8}
                      />
                    </div>
                    <p className="text-sm text-muted">
                      {STATUS_META[g.status].label}
                      {g.text && <span className="text-foreground">, {g.text}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Stage 4: how a status reaches the light, as a trail on one spine. */}
        <section className="lp-wrap" id="network" aria-labelledby="network-h">
          <div className="lp-stage lp-grid">
            <div className="lp-c1-5">
              <h2 id="network-h">4. It works on guest Wi-Fi</h2>
              <p className="lead">
                The light only ever calls out to bzzy.ca, every 20 seconds. Nothing has to reach it, so guest networks that keep devices
                apart are fine.
              </p>
              <ul className="mt-8 space-y-3">
                <li>Keeps your last status and today&apos;s calendar if Wi-Fi drops</li>
                <li>Signed firmware updates over Wi-Fi</li>
              </ul>
              <a className={`mt-8 inline-block ${LINK}`} href={PROTOCOL}>
                Read the device protocol
              </a>
            </div>
            <figure className="lp-c7-12 m-0 rounded-2xl border border-line bg-card p-6 sm:p-8">
              <ol
                className="lp-trail"
                aria-label="Your phone, Google Calendar, iCloud, Outlook and a team announcement all set your status at bzzy.ca, and the light fetches it every 20 seconds."
              >
                {SOURCES.map((s) => (
                  <li key={s.label}>
                    <span className="lp-trail__node" aria-hidden />
                    <span className="flex min-w-0 items-center gap-3">
                      <s.icon className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate font-medium">{s.label}</span>
                    </span>
                    <span className="text-right text-sm text-muted">{s.sub}</span>
                  </li>
                ))}
                <li className="mt-3 border-t border-line pt-3">
                  <span className="lp-trail__node lp-trail__node--hub" aria-hidden />
                  <span className="flex items-center gap-3">
                    <LinkIcon className="size-4 shrink-0 text-instrument" aria-hidden />
                    <span className="font-mono text-instrument">bzzy.ca</span>
                  </span>
                  <span className="text-right text-sm text-muted">holds your status</span>
                </li>
                <li>
                  <span className="lp-trail__node" aria-hidden />
                  <span className="flex items-center gap-3">
                    <BzzyMark className="size-4 shrink-0" />
                    <span className="font-medium">Your light</span>
                  </span>
                  <span className="text-right font-mono text-sm text-instrument">every 20 s</span>
                </li>
              </ol>
            </figure>
          </div>
        </section>

        {/* The open files: the statement, the specs as readings, and the case from three sides. */}
        <section className="lp-band" id="open" aria-labelledby="open-h">
          <div className="lp-wrap lp-grid">
            <div className="lp-c1-5">
              <h2 id="open-h">Yours to build and change</h2>
              <p className="lead">
                The board, the case and the firmware are yours to build and change, at home or at work, as long as nobody is charged for them.
              </p>
              <a className={`mt-8 inline-block ${LINK}`} href={LICENSE}>
                Read the licence
              </a>
            </div>
            <div className="lp-c7-12">
              <dl className="lp-panels m-0">
                {SPECS.map((s) => (
                  <div key={s.term} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-4 px-6 py-5">
                    <dt className="text-sm text-muted">{s.term}</dt>
                    <dd className="m-0 font-mono text-[15px] text-foreground">{s.detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-muted">
                Building your own? It uses a Waveshare ESP32-S3-Touch-LCD-1.69 board, with the same screen, ring and app.
              </p>
            </div>
            <div className="lp-views">
              {VIEWS.map((v) => (
                <figure key={v.title}>
                  <Image src={v.img} alt={v.alt} sizes="(min-width: 1024px) 420px, 100vw" />
                  <figcaption className="mt-3">
                    <span className="block font-medium">{v.title}</span>
                    <span className="block text-sm text-muted">{v.line}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Get one built: how a batch works, beside the shop's live batch. */}
        <BuySection batch={batch} />

        {/* Build one: the exploded case held while the three steps pass it. */}
        <section className="lp-section" id="build" aria-labelledby="build-h">
          <div className="lp-wrap lp-grid">
            <div className="lp-c1-6">
              <div className="lp-pin">
                <h2 id="build-h">Build a bzzy from the files</h2>
                <p className="lead">
                  Or{" "}
                  <a className={LINK} href="#buy">
                    get one built
                  </a>
                  .
                </p>
                <div className="lp-pin__frame mt-10">
                  <Image
                    src={caseExploded}
                    sizes="(min-width: 1024px) 640px, 100vw"
                    alt="The case taken apart: back plate and clip, the Waveshare board, the LED ring board, the black frame and the white light border"
                  />
                </div>
              </div>
            </div>
            <div className="lp-c8-12">
              <ol className="lp-steps">
                <li>
                  <h3>Download the files</h3>
                  <p className="mt-3 text-muted">The ring board in KiCad with its Gerbers and parts list, and the printable case.</p>
                  <a className={buttonClass("primary", "md", "mt-6 h-12 px-5 text-[15px]")} href={HARDWARE}>
                    Open the hardware folder
                  </a>
                </li>
                <li>
                  <h3>Order the board</h3>
                  <p className="mt-3 text-muted">JLCPCB builds and assembles it from the files; you solder four wires.</p>
                  <a className={`mt-5 inline-block ${LINK}`} href={ORDERING}>
                    Read how to order
                  </a>
                </li>
                <li>
                  <h3>Print the case and flash it</h3>
                  <p className="mt-3 text-muted">Print the case in black and the border in white, then flash the firmware over USB.</p>
                  <a className={`mt-5 inline-block ${LINK}`} href={FIRMWARE}>
                    See the firmware
                  </a>
                </li>
                <li>
                  <p className="text-sm text-muted">
                    Rev D of the ring board is being made at JLCPCB now; the first boards arrive in early December. Ring boards, cases
                    and mounts are coming to{" "}
                    <a className={LINK} href={SHOP_URL}>
                      the shop
                    </a>{" "}
                    too, for anyone who&apos;d rather not order from JLCPCB.
                  </p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* Say hello: the contact form, which emails hello@bzzy.ca. */}
        <section className="lp-section lp-section--rule" id="hello" aria-labelledby="hello-h">
          <div className="lp-wrap lp-grid">
            <div className="lp-c1-5">
              <h2 id="hello-h">Ask about building or buying one</h2>
              <p className="lead">Or about using it at work, or anything else. Messages go to hello@bzzy.ca.</p>
            </div>
            <div className="lp-c7-12">
              <LandingContact />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer" id="contact" aria-labelledby="close-h">
        <div className="lp-wrap">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="close-h" className="lp-close">Build one, or get one built</h2>
              <p className="lead">Every design file is on GitHub. Built lights ship in small batches across Canada.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a className={buttonClass("primary", "md", "h-12 px-5 text-[15px]")} href="#buy">
                {BUY_ACTION}
              </a>
              <a className={buttonClass("secondary", "md", "h-12 px-5 text-[15px]")} href="#build">
                {BUILD_ACTION}
              </a>
            </div>
          </div>
          <nav aria-label="Footer" className="mt-24 border-t border-line pt-8">
            <ul className="lp-footer__links text-sm">
              <li><a className="text-muted hover:text-foreground" href="#light">Statuses</a></li>
              <li><a className="text-muted hover:text-foreground" href="#gifs">GIFs</a></li>
              <li><a className="text-muted hover:text-foreground" href="#ways">Three ways</a></li>
              <li><a className="text-muted hover:text-foreground" href="#calendars">Calendars</a></li>
              <li><a className="text-muted hover:text-foreground" href="#network">Office Wi-Fi</a></li>
              <li><a className="text-muted hover:text-foreground" href="#build">Design files</a></li>
              <li><a className="text-muted hover:text-foreground" href={SHOP_URL}>Shop</a></li>
              <li><a className="text-muted hover:text-foreground" href="#open">Specs</a></li>
              <li><a className="text-muted hover:text-foreground" href="/sign-in">Sign in</a></li>
              <li><a className="text-muted hover:text-foreground" href="/docs/api">API</a></li>
              <li><a className="text-muted hover:text-foreground" href="#hello">Contact</a></li>
              <li><a className="text-muted hover:text-foreground" href={REPO}>GitHub</a></li>
              <li><a className="text-muted hover:text-foreground" href="/privacy">Privacy policy</a></li>
              <li><a className="text-muted hover:text-foreground" href="/terms">Terms</a></li>
            </ul>
            <div className="mt-8 flex flex-col gap-1 text-[13px] text-muted sm:flex-row sm:justify-between">
              <span>&copy; 2026 Adam Glover</span>
              <span>
                <a className="hover:text-foreground" href="https://giphy.com">
                  GIFs via GIPHY
                </a>
                . Product names and logos are trademarks of their owners.
              </span>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
