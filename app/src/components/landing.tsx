import { STATUS_META } from "@/components/status-meta";
import { STATUSES } from "@/lib/protocol";

import { PlaceholderImage } from "./placeholder-image";
import { SignIn } from "./sign-in";

// The signed-out home page. Every image is a <PlaceholderImage> for now.

const STEPS = [
  {
    title: "Set it from anywhere",
    body: "Tap Free, Busy, Do not disturb or Away on your phone or laptop. Add a short message and how long it should last.",
  },
  {
    title: "Or let your calendar do it",
    body: "Paste your calendar's ICS link and bzzy turns Busy for meetings and back to Free after. No Microsoft Graph or admin approval needed.",
  },
  {
    title: "Or just tap the light",
    body: "Tap the screen to step through statuses. Long-press to hand control back to your calendar.",
  },
];

const FEATURES = [
  {
    title: "Works on guest Wi-Fi",
    body: "The light only ever calls out to bzzy. Nothing needs to reach it, so it's happy on locked-down office networks.",
  },
  {
    title: "Keeps going offline",
    body: "It remembers your last status and today's calendar, and keeps time on its own clock if Wi-Fi drops.",
  },
  {
    title: "GIFs and messages",
    body: "A 1.69\" colour screen shows a GIF for each status, or a line of text like \"On a call, back at 3\".",
  },
  {
    title: "USB only",
    body: "One cable for power. Clips to the top of your monitor. No batteries, no subscription.",
  },
  {
    title: "For you or your team",
    body: "Use it alone, or set up a team so everyone's lights live in one place.",
  },
  {
    title: "Build your own",
    body: "Open firmware for a Waveshare ESP32-S3 touch board and a ring of WS2812 LEDs. Parts list on GitHub.",
  },
];

export function Landing() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="space-y-8 pt-4">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            A light on your desk that says when you&apos;re heads down.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            bzzy is a small status light for your monitor. Keep your door open, and let it tell people when now isn&apos;t
            a good time.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href="#sign-in"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Sign in
            </a>
            <a
              href="https://github.com/vancityactivist/bzzy"
              className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-card"
            >
              Build one
            </a>
          </div>
        </div>
        <PlaceholderImage
          label="Hero photo"
          hint="bzzy clipped to a monitor, glowing red for Busy, in a real office. 16:9."
        />
      </section>

      {/* Statuses */}
      <section className="space-y-6">
        <SectionHeading eyebrow="Four statuses" title="Everyone knows at a glance." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUSES.map((s) => (
            <div key={s} className="space-y-2">
              <PlaceholderImage aspect="portrait" label={STATUS_META[s].label} hint={`Device showing ${STATUS_META[s].label}`} />
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className={`h-3 w-3 rounded-full ${STATUS_META[s].bg}`} />
                {STATUS_META[s].label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <SectionHeading eyebrow="How it works" title="Three ways to set it. Pick whichever is closest." />
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-xl border border-line bg-card p-5">
              <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
          <PlaceholderImage label="App screenshot: status" hint="The status page on a phone, Busy selected. 16:9 crop." />
          <PlaceholderImage label="App screenshot: devices" hint="The devices page with one light paired. 16:9 crop." />
        </div>
      </section>

      {/* The device */}
      <section className="space-y-6">
        <SectionHeading eyebrow="The device" title="Small, bright, and yours." />
        <div className="grid gap-3 sm:grid-cols-2">
          <PlaceholderImage aspect="square" label="Device, front" hint="Screen showing a GIF, LED glow around the edge." />
          <PlaceholderImage aspect="square" label="Device, side" hint="Monitor clip and the USB-C cable." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sign in */}
      <section id="sign-in" className="scroll-mt-8 space-y-6">
        <SectionHeading eyebrow="Get started" title="Already have a bzzy?" />
        <SignIn />
      </section>

      <footer className="border-t border-line pt-6 text-sm text-muted">
        <span className="font-semibold tracking-tight text-foreground">bzzy</span> · a homebrew desk busy light ·{" "}
        <a href="https://github.com/vancityactivist/bzzy" className="hover:text-foreground">
          GitHub
        </a>
      </footer>
    </div>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-muted">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}
