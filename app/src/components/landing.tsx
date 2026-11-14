import Image, { type StaticImageData } from "next/image";

import caseBack from "@/assets/case-back.png";
import caseExploded from "@/assets/case-exploded.png";
import caseFront from "@/assets/case-front.png";
import caseTop from "@/assets/case-top.png";
import deskPhoto from "@/assets/desk.jpg";

import { defaultPreviewSrcs } from "@/lib/gifs";
import type { Status } from "@/lib/protocol";
import { viewFor, withShow } from "@/lib/screen";

import { DevicePreview } from "./device-preview";
import { LandingHeroDevice } from "./landing-hero";
import { CalendarSketch, StatusPickerSketch, TapSketch } from "./landing-illustrations";
import { LandingKit } from "./landing-kit";

// The signed-out home page, built with the taste skill's design system (public/assets,
// loaded only here). It owns the whole screen: app/(app)/layout.tsx gives every other page
// the app's header, and the home page only adds it when someone is signed in.
//
// type: product (hardware: site-kind tech)
// deal: hero product (the desk photo), nav nav-split, close close-word, footer footer-dark,
//       rhythm dark-band (#light), buttons block, ground sage; the mark is bzzy's own
//       four status dots (as on the sign-in card), in place of the dealt ring
//       palette lunar-grey-bronze, type suse; grounds bg-mist (hero), bg-band (#build)
//       effect grain-gradient in the one [data-visual] frame (#gifs); moment liquid-type (#open)

const REPO = "https://github.com/vancityactivist/bzzy";
const HARDWARE = `${REPO}/tree/main/hardware`;
const ORDERING = `${REPO}/tree/main/hardware#ordering-from-jlcpcb`;
const FIRMWARE = `${REPO}/tree/main/firmware`;
const PROTOCOL = `${REPO}/blob/main/docs/protocol.md`;
const LICENSE = `${REPO}/blob/main/LICENSE.md`;

const FONTS = "https://fonts.googleapis.com/css2?family=SUSE:wght@400..700&family=JetBrains+Mono:wght@400..500&display=swap";
const KIT_CSS = [
  "/assets/system.css",
  "/assets/ui/cards.css",
  "/assets/motion/motion.css",
  "/assets/backgrounds/backgrounds.css",
  "/assets/layout/layout.css",
  "/assets/icons/icon.css",
  "/assets/diagrams/diagram.css",
  "/landing.css",
];

// The palette and type exactly as start.mjs printed them (lunar-grey-bronze, suse).
const TOKENS = `:root {
  --p-bg: #111111; --p-surface: #1c1c1c; --p-ink: #f2f2f2; --p-muted: #8f8f8f;
  --p-accent: #a08672; --p-accent-ink: #111111; --p-action: #a08672; --p-action-ink: #111111;
  --p-inv-bg: #f2f2f2; --p-inv-surface: #e0e0e0; --p-inv-ink: #111111; --p-inv-muted: #5c5c5c;
  --p-inv-accent: #a08672; --p-inv-accent-ink: #111111; --p-inv-action: #a08672; --p-inv-action-ink: #111111;
  --font-display: "SUSE", system-ui, sans-serif;
  --font-text: "SUSE", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --display-weight: 500;
  --display-tracking: -0.03em;
  --display-tracking-xl: -0.04em;
}`;

// Runs as the page is parsed, before the first paint of the landing: the kit reads these
// from <html>. m-enter holds the hero's words for motion.js (700ms at most); mo-js the moment.
const BOOT = `(function(){var h=document.documentElement;
h.setAttribute("data-type","product");h.setAttribute("data-radius","soft");h.setAttribute("data-buttons","block");
h.setAttribute("data-ground","sage");h.setAttribute("data-motion","");
h.classList.add("m-enter","mo-js");
setTimeout(function(){h.classList.add("m-enter-done")},700);setTimeout(function(){h.classList.add("mo-safe")},2500);})();`;

const ARROW = (
  <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
    <path className="m-arrow__stem" d="M1 6h8" />
    <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
);

const MAIN_ACTION = "Get the design files";

const STATUS_ROWS: { status: Status; name: string; use: string }[] = [
  { status: "free", name: "Free", use: "Come over. Questions welcome." },
  { status: "busy", name: "Busy", use: "Working or on a call. Interrupt if it matters." },
  { status: "dnd", name: "Do not disturb", use: "Heads down. Save it for later." },
  { status: "away", name: "Away", use: "Not at your desk, or not in today." },
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

const SPECS: { term: string; detail: string }[] = [
  { term: "Screen", detail: "1.69 in touch, 240 × 280" },
  { term: "Board", detail: "Waveshare ESP32-S3" },
  { term: "Light", detail: "16 RGB LEDs on a 52 × 61 mm ring" },
  { term: "Power", detail: "USB-C, 400 mA cap on the LEDs" },
];

// How a status reaches the light (README: How it fits together). Calendar apps that
// publish an ICS link, by name.
const FLOW = {
  layout: "fanin",
  alt: "Your phone, Google Calendar, Outlook and a team push all set your status at bzzy.ca, and the light fetches it every 20 seconds.",
  sources: [
    { label: "Phone or laptop", icon: "ui:smartphone", sub: "Tap a status" },
    { label: "Google Calendar", icon: "google-calendar", sub: "ICS link" },
    { label: "Outlook", icon: "file:file-type-outlook", sub: "ICS link" },
    { label: "Your team", icon: "ui:users", sub: "A push to every light" },
  ],
  target: { label: "bzzy.ca", icon: "ui:server" },
  then: { label: "Your light", icon: "ui:lightbulb", meta: "every 20 s" },
};

const MENU: { img: StaticImageData; alt: string; title: string; line: string }[] = [
  { img: caseFront, alt: "The bzzy case from the front: a black frame with a white light border round the screen", title: "The case", line: "Black, with a frosted border" },
  { img: caseTop, alt: "The top of the case, with the button and the bzzy wordmark", title: "The button", line: "One press changes your status" },
  { img: caseBack, alt: "The back of the case, with the clip that holds it on a monitor", title: "The clip", line: "Hooks over a monitor's top edge" },
];

// bzzy's mark: the four status colours as a 2 x 2 tile, as on the sign-in card.
function BzzyMark() {
  return (
    <span className="bzzy-mark" aria-hidden="true">
      <i className="status-dot--free" />
      <i className="status-dot--busy" />
      <i className="status-dot--dnd" />
      <i className="status-dot--away" />
    </span>
  );
}

export function Landing() {
  const gifs = defaultPreviewSrcs();

  return (
    <>
      {/* Head: React hoists these into <head>, in this order. */}
      <meta name="site-kind" content="tech" />
      <meta name="page-type" content="product" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FONTS} precedence="taste" />
      {KIT_CSS.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="taste" />
      ))}
      <style href="bzzy-landing-tokens" precedence="taste">
        {TOKENS}
      </style>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      {/* Plain on purpose: it sets the ground tokens before the first paint of this dark page. */}
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script src="/assets/backgrounds/backgrounds.js" />

      <header className="nav nav--split">
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">
            Skip to content
          </a>
          <nav className="nav__links" aria-label="Main">
            <div className="nav__item">
              <a className="nav__link" href="#light">
                Light
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#gifs">
                GIFs
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#ways">
                Setup
              </a>
            </div>
            <div className="nav__item">
              <a className="nav__link" href="#build">
                Build{" "}
                <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <div className="nav__menu">
                <div className="wrap grid">
                  {MENU.map((m) => (
                    <a key={m.title} className="menu-card span-4" href="#build">
                      <div className="panel">
                        <Image className="frame__img" src={m.img} alt={m.alt} sizes="(min-width: 1024px) 410px, 100vw" />
                      </div>
                      <span className="t-card">{m.title}</span>
                      <span className="t-small muted">{m.line}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </nav>
          <a className="nav__logo" href="#top">
            <BzzyMark />
            bzzy
          </a>
          <div className="nav__actions">
            <a className="nav__link" href="/sign-in">
              Sign in
            </a>
            <a className="btn btn--primary" href="#build">
              {MAIN_ACTION}
            </a>
          </div>
          <button className="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main id="top">
        {/* Hero (product): the head row, then the photograph edge to edge down to the fold. */}
        <section className="hero hero--product bg-mist" data-enter aria-labelledby="hero-h">
          <div className="wrap">
            <div className="hero-text hero__in">
              <div className="hero__head">
                <div>
                  <h1 id="hero-h">Desk status light for heads-down work</h1>
                  <p className="hero__lead">
                    bzzy clips to your monitor and shows your status on a ring of 16 LEDs around a small GIF screen.
                  </p>
                </div>
                <div className="btn-row">
                  <a className="btn btn--primary" href="#build">
                    {MAIN_ACTION}
                    {ARROW}
                  </a>
                  <a className="btn btn--secondary" href="#light">
                    See the four statuses
                  </a>
                </div>
              </div>
              <div className="hero__stage">
                {/* Client slot: a photograph of the first built bzzy replaces this concept picture. */}
                <Image
                  src={deskPhoto}
                  sizes="100vw"
                  priority
                  alt="A small black status light clipped to the top of a monitor, casting a red Busy glow on the wall behind it"
                  style={{ ["--ly-pos" as string]: "50% 45%" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Three ways to set it (steps): the app's own pieces, one per way. */}
        <section className="section" id="ways" aria-labelledby="ways-h" style={{ ["--hm" as string]: 2 }}>
          <div className="wrap">
            <div className="section-head">
              <h2 id="ways-h">
                Set your status 3 ways. <span className="muted">What you set by hand wins until it runs out.</span>
              </h2>
            </div>
            <div className="grid">
              <article className="card card--row span-4">
                <h3>Tap a status on your phone</h3>
                <p>Pick one of four, add a short message and say how long it lasts.</p>
                <div className="panel">
                  <div className="ui ways__art bzzy-ui" role="img" aria-label="The app's status picker with Busy chosen and the message On a call, back at 3">
                    <StatusPickerSketch />
                  </div>
                </div>
              </article>
              <article className="card card--row span-4">
                <h3>Follow your calendar</h3>
                <p>Paste an ICS link and meetings turn the light Busy. No admin approval needed.</p>
                <div className="panel">
                  <div className="ui ways__art bzzy-ui" role="img" aria-label="A morning calendar with three meetings, and the light's colour changing to match">
                    <CalendarSketch />
                  </div>
                </div>
              </article>
              <article className="card card--row span-4">
                <h3>Tap the light itself</h3>
                <p>A tap steps through the statuses. A long press hands control back to the calendar.</p>
                <div className="panel">
                  <div className="ui ways__art ways__art--tap bzzy-ui" role="img" aria-label="A tap on the light's screen steps from Free to Busy to Do not disturb">
                    <TapSketch gifSrc={gifs.free} />
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* The light (dark-band: the page's one contrasting ground), the live preview. */}
        <section className="section ground-inverse" id="light" aria-labelledby="light-h">
          <div className="wrap grid">
            <div className="span-5">
              <div className="section-head">
                <h2 id="light-h">Four statuses on a ring of 16 LEDs</h2>
              </div>
              <ul className="rows">
                {STATUS_ROWS.map((r) => (
                  <li key={r.status}>
                    <span className="rows__name">
                      <span className={`status-dot status-dot--${r.status}`} aria-hidden="true" />
                      {r.name}
                    </span>
                    <p>{r.use}</p>
                  </li>
                ))}
              </ul>
              <p className="light__note">The ring can also pulse, blink, strobe or spin, and flashes a few minutes before each meeting.</p>
            </div>
            <div className="light__frame span-6 start-7">
              <div className="ui bzzy-ui bzzy-ui--light light__device">
                <LandingHeroDevice gifs={gifs} scale={0.8} hint={false} />
              </div>
            </div>
          </div>
        </section>

        {/* GIFs: the page's one effect, in its one [data-visual] frame. */}
        <section className="section" id="gifs" aria-labelledby="gifs-h">
          <div className="wrap">
            <div className="section-head">
              <h2 id="gifs-h">
                A GIF for every status. <span className="muted">Upload one or paste a GIPHY or Tenor link.</span>
              </h2>
            </div>
            <div className="frame frame--hero gifs__frame" data-visual data-fx="grain-gradient" data-fx-seed="11">
              <ul className="ui gifs__row bzzy-ui">
                {GIF_SCREENS.map((g) => {
                  const base = viewFor({ status: g.status, text: g.show ? "" : g.text, until: 0 });
                  return (
                    <li key={g.label} role="img" aria-label={g.label}>
                      <DevicePreview
                        view={g.show ? withShow(base, { text: g.text, until: 0, gif: true }) : base}
                        gifSrc={g.gif}
                        gifFit
                        lazy
                        scale={0.8}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Networks (split-text-left): how a status reaches the light, as a diagram. */}
        <section className="section" id="network" aria-labelledby="network-h">
          <div className="wrap grid">
            <div className="span-5 stack-5">
              <h2 id="network-h">The light works on guest Wi-Fi</h2>
              <p className="t-lead">
                The light only ever calls out to bzzy.ca, every 20 seconds. Nothing has to reach it, so guest networks that
                keep devices apart are fine.
              </p>
              <ul className="network__facts">
                <li>Keeps your last status and today&apos;s calendar if Wi-Fi drops</li>
                <li>Signed firmware updates over Wi-Fi</li>
              </ul>
              <a className="link" href={PROTOCOL}>
                Read the device protocol
              </a>
            </div>
            <div className="frame frame--split span-6 start-7">
              <div className="dg" data-diagram="">
                <script type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FLOW) }} />
              </div>
            </div>
          </div>
        </section>

        {/* The statement, with the dealt liquid-type moment on its headline; the specs under it. */}
        <section className="section" id="open" aria-labelledby="open-h">
          <div className="wrap">
            <h2 id="open-h" className="mo-lt__type" data-moment="liquid-type" data-moment-opts='{"strength": 1}'>
              Every bzzy design file on GitHub
            </h2>
            <div className="grid open__grid">
              <div className="span-5 stack-5">
                <p className="t-lead">
                  The board, the case and the firmware are yours to build and change, at home or at work, as long as nobody
                  is charged for them.
                </p>
                <a className="link" href={LICENSE}>
                  Read the licence
                </a>
              </div>
              <ul className="rows rows--spec span-6 start-7">
                {SPECS.map((s) => (
                  <li key={s.term}>
                    <span className="rows__name">{s.term}</span>
                    <span className="rows__value">{s.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Build one: the steps beside the exploded case. */}
        <section className="section bg-band bg-bleed" id="build" aria-labelledby="build-h">
          <div className="wrap grid">
            <div className="span-5">
              <div className="section-head">
                <h2 id="build-h">
                  Build a bzzy from the files. <span className="muted">Pre-built lights come later.</span>
                </h2>
              </div>
              <ul className="rows build__steps">
                <li>
                  <span className="rows__name">1. Download the files</span>
                  <p>
                    The ring board in KiCad with its Gerbers and parts list, and the printable case.{" "}
                    <a className="link" href={HARDWARE}>
                      Open the hardware folder
                    </a>
                  </p>
                </li>
                <li>
                  <span className="rows__name">2. Order the board</span>
                  <p>
                    JLCPCB builds and assembles it from the files; you solder four wires.{" "}
                    <a className="link" href={ORDERING}>
                      Read how to order
                    </a>
                  </p>
                </li>
                <li>
                  <span className="rows__name">3. Print the case and flash it</span>
                  <p>
                    Print the case in black and the border in white, then flash the firmware over USB.{" "}
                    <a className="link" href={FIRMWARE}>
                      See the firmware
                    </a>
                  </p>
                </li>
              </ul>
              <p className="build__note">Rev C of the board has passed KiCad&apos;s design checks. The first one is being built now.</p>
            </div>
            <div className="frame frame--photo build__frame span-6 start-7">
              <Image
                className="frame__img"
                src={caseExploded}
                sizes="(min-width: 1024px) 628px, 100vw"
                alt="The case taken apart: back plate and clip, the Waveshare board, the LED ring board, the black frame and the white light border"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="footer closing footer--dark ground-inverse" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--word">
            <div className="section-head--split">
              <div>
                <h2 id="close-h">Build your own desk light</h2>
                <p className="t-lead">The files, the parts list and the firmware are on GitHub.</p>
              </div>
              <a className="btn btn--primary" href="#build">
                {MAIN_ACTION}
                {ARROW}
              </a>
            </div>
            <p className="close__word" aria-hidden="true">
              bzzy
            </p>
          </div>
          <div className="closing__links">
            <div className="grid">
              <div className="span-4 stack-4">
                <a className="nav__logo" href="#top">
                  <BzzyMark />
                  bzzy
                </a>
                <p className="footer__lede">A desk status light you build yourself.</p>
              </div>
              <div className="span-2 footer__col">
                <h3>Light</h3>
                <ul>
                  <li><a href="#light">Statuses</a></li>
                  <li><a href="#gifs">GIFs</a></li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>Setup</h3>
                <ul>
                  <li><a href="#ways">Three ways</a></li>
                  <li><a href="#network">Office Wi-Fi</a></li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>Build</h3>
                <ul>
                  <li><a href="#build">Design files</a></li>
                  <li><a href="#open">Specs</a></li>
                </ul>
              </div>
              <div className="span-2 footer__col">
                <h3>App</h3>
                <ul>
                  <li><a href="/sign-in">Sign in</a></li>
                  <li><a href={REPO}>GitHub</a></li>
                </ul>
              </div>
            </div>
            <div className="footer__legal">
              <span>&copy; 2026 Adam Glover</span>
              <div className="socials" />
              <a className="credits" href="https://giphy.com">
                GIFs via GIPHY. Product names and logos are trademarks of their owners
              </a>
            </div>
          </div>
        </div>
      </footer>

      <LandingKit />
    </>
  );
}
