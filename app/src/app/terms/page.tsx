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
          signing in you agree to them. Buying a bzzy light has its own terms in the shop.
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

        <H>Changes and law</H>
        <p>
          These terms may be updated; the date above says when. They&apos;re governed by the laws of British Columbia
          and Canada.
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
