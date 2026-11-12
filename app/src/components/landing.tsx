import type { ComponentType, ReactNode } from "react";

import { STATUS_META } from "@/components/status-meta";
import { defaultPreviewSrcs } from "@/lib/gifs";
import { type Status, STATUSES } from "@/lib/protocol";
import { viewFor } from "@/lib/screen";

import { DevicePreview } from "./device-preview";
import { GithubIcon, type IconProps, UsersIcon, WifiOffIcon } from "./icons";
import { LandingHeroDevice } from "./landing-hero";
import { ArrowRightIcon, MessageIcon, PlugIcon, WifiOutIcon, WrenchIcon } from "./landing-icons";
import { CalendarSketch, StatusPickerSketch, TapSketch } from "./landing-illustrations";
import { SignIn } from "./sign-in";
import { Badge, buttonClass, Card, Container, cx, StatusDot } from "./ui";

// The signed-out home page. Every picture on it is the real device preview or a small
// drawing made from the app's own pieces; there are no photos yet (see DevicePhoto).

const REPO = "https://github.com/vancityactivist/bzzy";

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
    body: "Use it alone, or set up a team so everyone's lights live in one place.",
    icon: UsersIcon,
  },
  {
    title: "Build your own",
    body: "Open firmware for a Waveshare ESP32-S3 touch board and a ring of WS2812 LEDs. Parts list on GitHub.",
    icon: WrenchIcon,
  },
];

const SPECS: { term: string; detail: string }[] = [
  { term: "Screen", detail: '1.69", 240 × 280' },
  { term: "Board", detail: "ESP32-S3 touch" },
  { term: "Light", detail: "WS2812 LED ring" },
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
              <a href={REPO} className={buttonClass("secondary", "md", "px-5")}>
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
              A touch screen and a ring of LEDs that clips to the top of your monitor. Build it from off-the-shelf parts.
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
            href={REPO}
            className="group mt-6 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors hover:text-foreground"
          >
            No light yet? Build one from the parts list
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

/**
 * The one spot for a photo of the real light, when there is one. Until then it renders
 * nothing and the section reads fine without it. To add it: put the picture in public/
 * and return something like
 *
 *   <figure className="mt-10 overflow-hidden rounded-2xl border border-line shadow-card">
 *     <Image src="/device.jpg" alt="bzzy clipped to a monitor, glowing red for Busy" width={1600} height={900}
 *       sizes="(min-width: 1024px) 976px, 100vw" className="aspect-video w-full object-cover" />
 *   </figure>
 *
 * (import Image from "next/image").
 */
function DevicePhoto() {
  return null;
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
