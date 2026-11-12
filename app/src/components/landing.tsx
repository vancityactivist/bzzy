import Image from "next/image";
import type { ComponentType, ReactNode } from "react";

import deskPhoto from "@/assets/desk.jpg";

import { STATUS_META } from "@/components/status-meta";
import { defaultPreviewSrcs } from "@/lib/gifs";
import { type Status, STATUSES } from "@/lib/protocol";
import type { LedStyle } from "@/lib/push-rules";
import { viewFor, withShow } from "@/lib/screen";

import { DevicePreview } from "./device-preview";
import { GithubIcon, type IconProps, UsersIcon, WifiOffIcon } from "./icons";
import { LandingHeroDevice } from "./landing-hero";
import {
  ArrowRightIcon,
  BoxIcon,
  ChipIcon,
  DownloadIcon,
  MessageIcon,
  PlugIcon,
  WifiOutIcon,
  WrenchIcon,
} from "./landing-icons";
import { CalendarSketch, StatusPickerSketch, TapSketch } from "./landing-illustrations";
import { SignIn } from "./sign-in";
import { Badge, buttonClass, Card, Container, cx, StatusDot } from "./ui";

// The signed-out home page. Every picture on it is the real device preview or a small
// drawing made from the app's own pieces, apart from one concept picture (see DevicePhoto).

const REPO = "https://github.com/vancityactivist/bzzy";
const HARDWARE = `${REPO}/tree/main/hardware`;
const ORDERING = `${REPO}/tree/main/hardware#ordering-from-jlcpcb`;

const STATUS_USE: Record<Status, string> = {
  free: "Come over. Questions welcome.",
  busy: "Working or on a call. Interrupt if it matters.",
  dnd: "Heads down. Save it for later.",
  away: "Not at your desk, or not in today.",
};

const STEPS: { title: string; body: ReactNode; art: (gifs: Record<Status, string | null>) => ReactNode }[] = [
  {
    title: "Set it from anywhere",
    body: "Tap Free, Busy, Do not disturb or Away on your phone or laptop. Add a short message and how long it should last.",
    art: () => <StatusPickerSketch />,
  },
  {
    title: "Or let your calendar do it",
    body: "Paste your calendar's ICS link and bzzy turns Busy for meetings and back to Free after. No Microsoft Graph or admin approval needed.",
    art: () => <CalendarSketch />,
  },
  {
    title: "Or just tap the light",
    body: "Tap the screen to step through statuses. Long-press to hand control back to your calendar.",
    art: (gifs) => <TapSketch gifSrc={gifs.free} />,
  },
];

// The ring's flashing patterns, each on a real preview. Spin leads: it's the one that
// gets noticed from across the room.
const FLASHES: { name: string; use: string; ring: LedStyle; status: Status; message?: string }[] = [
  {
    name: "Spin",
    use: "A bright arc chases round the ring. Hard to miss from across the room, so it's the one for team pushes.",
    ring: { pattern: "spin", color: "#2979ff", speed: 2 },
    status: "free",
    message: "Pizza in the kitchen",
  },
  {
    name: "Pulse",
    use: "A slow breathe. Good for Do not disturb.",
    ring: { pattern: "pulse", speed: 1 },
    status: "dnd",
  },
  {
    name: "Blink",
    use: "On, off, on. A meeting starts in 5 minutes.",
    ring: { pattern: "blink", color: "#ff8a00", speed: 1 },
    status: "busy",
    message: "Meeting in 5",
  },
  {
    name: "Strobe",
    use: "Short, sharp bursts for the things that can't wait.",
    ring: { pattern: "strobe", color: "#ff2000", speed: 2 },
    status: "free",
    message: "Fire drill at 3",
  },
];

const FLASH_POINTS = [
  "Pick a pattern, colour and speed for each status.",
  "Flash a warning a few minutes before every meeting, even if Wi-Fi drops.",
  "Team admins can push a message to everyone's light, with a flash to match. Any press dismisses it.",
  "Never faster than 3 flashes a second, and one switch turns flashing off for a light.",
];

const FEATURES: { title: string; body: string; icon: ComponentType<IconProps> }[] = [
  {
    title: "Works on guest Wi-Fi",
    body: "The light only ever calls out to bzzy. Nothing needs to reach it, so it's happy on locked-down office networks.",
    icon: WifiOutIcon,
  },
  {
    title: "Keeps going offline",
    body: "It remembers your last status and today's calendar, and keeps time on its own clock if Wi-Fi drops.",
    icon: WifiOffIcon,
  },
  {
    title: "GIFs and messages",
    body: 'A 1.69" colour screen shows a GIF for each status, or a line of text like "On a call, back at 3".',
    icon: MessageIcon,
  },
  {
    title: "USB only",
    body: "One cable for power. Clips to the top of your monitor. No batteries, no subscription.",
    icon: PlugIcon,
  },
  {
    title: "For you or your team",
    body: "Use it alone, or set up a team: admins see everyone's light at a glance and can push a message to all of them.",
    icon: UsersIcon,
  },
  {
    title: "Build your own",
    body: "Open design files for the circuit board and case, and open firmware. Order the board, print the case, flash it.",
    icon: WrenchIcon,
  },
];

const SPECS: { term: string; detail: string }[] = [
  { term: "Screen", detail: '1.69", 240 × 280' },
  { term: "Board", detail: "ESP32-S3 touch" },
  { term: "Light", detail: "16 LEDs, custom board" },
  { term: "Power", detail: "USB" },
];

export function Landing() {
  const gifs = defaultPreviewSrcs();

  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section aria-labelledby="hero-title">
        <Container
          padded={false}
          className="grid items-center gap-4 pt-10 pb-16 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10 lg:py-24"
        >
          <div className="max-w-xl">
            <Badge className="mb-5">
              <StatusDot status="free" size="sm" />
              Homebrew and open source
            </Badge>
            <h1
              id="hero-title"
              className="text-[2.5rem] leading-[1.04] font-semibold tracking-[-0.04em] text-balance sm:text-5xl lg:text-[3.5rem]"
            >
              A light on your desk that says when you&apos;re heads down.
            </h1>
            <p className="mt-5 max-w-md text-lg text-pretty text-muted">
              bzzy is a small status light for your monitor. Keep your door open, and let it tell people when now isn&apos;t a
              good time.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#sign-in" className={buttonClass("primary", "md", "px-5")}>
                Sign in
              </a>
              <a href="#get-one" className={buttonClass("secondary", "md", "px-5")}>
                <GithubIcon />
                Build one
              </a>
            </div>
          </div>
          <LandingHeroDevice gifs={gifs} />
        </Container>
      </section>

      {/* Four statuses */}
      <section aria-labelledby="statuses-title" className="pt-12 pb-20 sm:pt-16 sm:pb-28">
        <Container padded={false}>
          <SectionHeading id="statuses-title" eyebrow="Four statuses" title="Everyone knows at a glance.">
            The ring of LEDs glows the status colour and the screen spells it out, so nobody has to ask.
          </SectionHeading>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {STATUSES.map((s) => (
              <li key={s}>
                <Card padding="none" className="h-full overflow-hidden">
                  <div className="flex justify-center border-b border-line bg-subtle/50 py-3 sm:py-5">
                    <div className="sm:[zoom:1.15]">
                      <DevicePreview view={viewFor({ status: s, text: "", until: 0 })} gifSrc={gifs[s]} scale={0.5} className="m-3" />
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="flex items-center gap-2 font-semibold tracking-tight">
                      <StatusDot status={s} />
                      {STATUS_META[s].label}
                    </h3>
                    <p className="mt-1 text-sm text-pretty text-muted">{STATUS_USE[s]}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* The ring: flashing patterns, spin first */}
      <section aria-labelledby="flash-title" className="pb-20 sm:pb-28">
        <Container padded={false}>
          <SectionHeading id="flash-title" eyebrow="The ring" title="It can do more than glow.">
            Sixteen LEDs round the screen can pulse, blink, strobe or spin, so the light gets noticed when it matters.
          </SectionHeading>
          <ul className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4">
            {FLASHES.map((f, i) => {
              const lead = i === 0;
              return (
                <li key={f.name} className={lead ? "sm:col-span-3" : undefined}>
                  <Card padding="none" className={cx("flex h-full flex-col overflow-hidden", lead && "md:flex-row")}>
                    <div
                      className={cx(
                        "flex items-center justify-center bg-subtle/50",
                        lead ? "border-b border-line py-8 sm:py-10 md:flex-1 md:border-r md:border-b-0" : "border-b border-line py-3 sm:py-5",
                      )}
                    >
                      <DevicePreview
                        view={withShow(
                          viewFor({ status: f.status, text: "", until: 0 }),
                          f.message ? { text: f.message, until: 0, gif: false } : null,
                        )}
                        gifSrc={f.message ? null : gifs[f.status]}
                        ring={f.ring}
                        scale={lead ? 0.8 : 0.5}
                        className="m-4"
                      />
                    </div>
                    <div className={lead ? "p-5 sm:p-8 md:flex md:w-[42%] md:flex-col md:justify-center" : "p-4 sm:p-5"}>
                      <h3 className={cx("flex items-center gap-2 font-semibold tracking-tight", lead && "text-xl")}>
                        {f.name}
                        {lead && <Badge tone="inverse">Our favourite</Badge>}
                      </h3>
                      <p className={cx("mt-1 text-pretty text-muted", lead ? "text-base" : "text-sm")}>{f.use}</p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <ul className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {FLASH_POINTS.map((p) => (
              <li key={p} className="flex gap-2.5 text-pretty">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/60" />
                <span className="text-muted">{p}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Three ways to set it */}
      <section aria-labelledby="ways-title" className="border-y border-line bg-subtle/40 py-20 sm:py-28">
        <Container padded={false}>
          <SectionHeading id="ways-title" eyebrow="How it works" title="Three ways to set it.">
            Pick whichever is closest. Anything you set by hand wins over the calendar until it runs out.
          </SectionHeading>
          <ol className="mt-10 grid gap-4 lg:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <Card padding="none" className="flex h-full flex-col overflow-hidden">
                  <div className="flex h-60 items-center justify-center border-b border-line bg-background/60 px-6">
                    {step.art(gifs)}
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</p>
                    <h3 className="mt-1 font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-1.5 text-sm text-pretty text-muted">{step.body}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* The device */}
      <section aria-labelledby="device-title" className="py-20 sm:py-28">
        <Container padded={false}>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
            <SectionHeading id="device-title" eyebrow="The device" title="Small, bright, and yours.">
              A touch screen framed by a ring of LEDs on bzzy&apos;s own circuit board. It clips to the top of your monitor, and
              the design files are open, so you can make one yourself.
            </SectionHeading>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              {SPECS.map((spec) => (
                <div key={spec.term} className="bg-card px-4 py-3">
                  <dt className="font-mono text-[11px] tracking-wider text-muted uppercase">{spec.term}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{spec.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <DevicePhoto />

          <GetOne />

          <ul className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, body, icon: Icon }) => (
              <li key={title} className="bg-card p-6">
                <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-subtle text-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Sign in: the header's and hero's "Sign in" link here. */}
      <section id="sign-in" aria-label="Sign in" className="border-t border-line bg-subtle/40 py-20 sm:py-28">
        <Container padded={false} className="flex flex-col items-center">
          <div className="w-full max-w-sm">
            <SignIn bare />
          </div>
          <a
            href="#get-one"
            className="group mt-6 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-foreground"
          >
            No light yet? Make one from the design files
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </Container>
      </section>

      <footer className="border-t border-line">
        <Container padded={false} className="flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-baseline gap-3 text-sm text-muted">
            <span className="text-lg font-semibold tracking-tight text-foreground">bzzy</span>a homebrew desk busy light
          </p>
          <a href={REPO} className={cx(buttonClass("ghost", "sm"), "-ml-3 self-start sm:ml-0 sm:self-auto")}>
            <GithubIcon />
            GitHub
          </a>
        </Container>
      </footer>
    </div>
  );
}

const GET_ONE: {
  title: string;
  body: string;
  icon: ComponentType<IconProps>;
  link?: { href: string; label: string };
  later?: boolean;
}[] = [
  {
    title: "Download the files",
    body: "The circuit board (KiCad and Gerbers), the parts list and the 3D-printable case. All open source.",
    icon: DownloadIcon,
    link: { href: HARDWARE, label: "Design files" },
  },
  {
    title: "Order the board, print the case",
    body: "Upload the files to a board maker like JLCPCB and they'll build and assemble it. Print the case at home or through a print service.",
    icon: ChipIcon,
    link: { href: ORDERING, label: "How to order" },
  },
  {
    title: "Or get one ready-made",
    body: "Pre-built lights, assembled and tested, are on the way. No soldering iron needed.",
    icon: BoxIcon,
    later: true,
  },
];

// How to get a light: make one from the open files today, or buy one built later.
function GetOne() {
  return (
    <div id="get-one" className="mt-16 scroll-mt-24">
      <h3 className="text-xl font-semibold tracking-tight">Get a bzzy</h3>
      <p className="mt-1 max-w-xl text-pretty text-muted">Make your own from the open files today. Pre-built lights come later.</p>
      <ol className="mt-6 grid gap-4 lg:grid-cols-3">
        {GET_ONE.map(({ title, body, icon: Icon, link, later }) => (
          <li key={title}>
            <div
              className={cx(
                "flex h-full flex-col rounded-2xl border p-5 sm:p-6",
                later ? "border-dashed border-line bg-subtle/40" : "border-line bg-card shadow-card",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-subtle text-foreground">
                  <Icon className="size-5" />
                </span>
                {later && <Badge>Coming later</Badge>}
              </div>
              <h4 className="mt-4 font-semibold tracking-tight">{title}</h4>
              <p className="mt-1 flex-1 text-sm text-pretty text-muted">{body}</p>
              {link && (
                <a
                  href={link.href}
                  className="group mt-4 inline-flex items-center gap-1.5 self-start rounded-md text-sm font-medium transition-colors hover:text-muted"
                >
                  {link.label}
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// A picture of the idea: an illustration made before the first light was built, so the
// caption says so. Swap in a photo of the real thing when there is one.
function DevicePhoto() {
  return (
    <figure className="mt-10">
      <Image
        src={deskPhoto}
        alt="A small black status light clipped to the top of a monitor, casting a red glow on the wall behind it"
        placeholder="blur"
        sizes="(min-width: 1024px) 976px, 100vw"
        className="aspect-video w-full rounded-2xl border border-line object-cover shadow-card"
      />
      <figcaption className="mt-3 text-sm text-muted">
        Busy, from across the room. A concept picture: the first build is still on the bench.
      </figcaption>
    </figure>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-xl">
      <p className="font-mono text-xs tracking-wider text-muted uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-3 text-pretty text-muted sm:text-lg">{children}</p>}
    </div>
  );
}
