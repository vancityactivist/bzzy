import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BzzyMark } from "@/components/brand";

// Terms for using the bzzy app. Buying a light from the shop has its own terms there.

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the bzzy app.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "November 22, 2026";

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <BzzyMark className="size-6 shrink-0" />
        bzzy
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <div className="mt-6 space-y-4 leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          These terms cover using the bzzy app at bzzy.ca, which is run by Adam Glover in British Columbia, Canada. By
          signing in you agree to them. You need to be at least 13, and old enough to agree to them where you live. Buying
          a bzzy light has its own{" "}
          <a className="underline underline-offset-2" href="https://shop.bzzy.ca/terms">
            terms of sale
          </a>
          .
        </p>

        <H>The service</H>
        <p>
          bzzy shows your status on your desk lights, from what you set and from calendars you connect. It&apos;s
          provided as it is, without any promise that it will always be available or error-free. Features may change
          or end. A missed meeting or an interruption your light didn&apos;t prevent isn&apos;t something bzzy can be
          responsible for.
        </p>

        <H>Your part</H>
        <ul>
          <li>Keep your sign-in, API tokens and light tokens to yourself.</li>
          <li>Only connect calendars and upload GIFs you have the right to use.</li>
          <li>Don&apos;t use bzzy to harass anyone, break the law, or overload or attack the service.</li>
        </ul>
        <p>Accounts that break these terms may be suspended or closed.</p>

        <H>Teams, the API and webhooks</H>
        <ul>
          <li>A team&apos;s owner and admins manage its members and lights. Members see each other&apos;s status.</li>
          <li>
            The API and webhooks are for your own lights and teams. Keep within the rate limits, and don&apos;t use them to
            scrape other people&apos;s data.
          </li>
        </ul>

        <H>Open source</H>
        <p>
          bzzy&apos;s firmware, app code and design files are published under the licences in the GitHub repository. These
          terms don&apos;t change those licences. The bzzy name and logo belong to Adam Glover.
        </p>

        <H>Your data</H>
        <p>
          What you put in bzzy stays yours. How it&apos;s stored and used is described in the{" "}
          <Link className="underline underline-offset-2" href="/privacy">
            privacy policy
          </Link>
          .
        </p>

        <H>Liability</H>
        <p>
          To the extent the law allows, bzzy and Adam Glover aren&apos;t liable for indirect or consequential losses
          from using the app, and total liability is limited to what you paid for the app in the previous twelve
          months (the app itself is free).
        </p>

        <H>Ending</H>
        <p>
          You can stop using bzzy any time and ask for your account to be deleted. If bzzy ever shuts down, you&apos;ll get
          at least 30 days&apos; notice by email.
        </p>

        <H>Changes and law</H>
        <p>
          These terms may be updated; the date above says when, and big changes are emailed to you first. They&apos;re
          governed by the laws of British Columbia and Canada, and nothing in them takes away rights you have under BC
          consumer law.
        </p>

        <H>Contact</H>
        <p>
          <a className="underline underline-offset-2" href="mailto:hello@bzzy.ca">
            hello@bzzy.ca
          </a>
        </p>
      </div>
    </main>
  );
}
