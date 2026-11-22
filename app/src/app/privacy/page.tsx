import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { BzzyMark } from "@/components/brand";

// The privacy policy. Public, because Google's consent screen links to it. Keep it in
// plain words and in step with what the code actually does.

export const metadata: Metadata = {
  title: "Privacy",
  description: "What bzzy stores, why, and how to delete it.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "November 22, 2026";

function H({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight">{children}</h2>;
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <BzzyMark className="size-6 shrink-0" />
        bzzy
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>

      <div className="mt-6 space-y-4 leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          bzzy is a desk light that shows whether you can be interrupted, and the app at bzzy.ca that runs it. It&apos;s
          made by Adam Glover in British Columbia, Canada. This page says what bzzy keeps about you and why.
        </p>

        <H>What bzzy stores</H>
        <ul>
          <li>Your account: name, email address and profile picture from GitHub, and your passkeys.</li>
          <li>Your lights, your status and messages, the GIFs you upload, your teams and settings.</li>
          <li>
            From calendars you connect: the start and end time, free/busy state and title of events in the next eight
            days. Titles are only shown on a light if you turn that on.
          </li>
          <li>
            For a connected calendar account: the account&apos;s email address or login and its access token or
            app-specific password, encrypted before it&apos;s stored. For an ICS link: the link itself, kept private.
          </li>
        </ul>

        <H>Google Calendar</H>
        <p>
          If you connect a Google account, bzzy asks for read-only access to your list of calendars and their events.
          It uses that only to decide your status (busy, away, do not disturb) and, if you choose, to show the
          meeting title on your light. bzzy never changes your calendar, never reads your Gmail, contacts or files,
          and never shows your calendar to anyone else. Teammates see your status, never your calendar.
        </p>
        <p>
          bzzy&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            className="underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google data is not sold, not used for advertising, and not used
          to train AI models. You can disconnect in Settings at any time, which deletes the token and the saved events
          and tells Google to revoke bzzy&apos;s access. You can also remove access from your Google Account&apos;s
          security settings.
        </p>

        <H>iCloud and other calendar servers</H>
        <p>
          If you connect iCloud or another CalDAV server, bzzy uses the app-specific password you give it only to read
          your calendars, the same way as above. Apple&apos;s app-specific passwords can&apos;t be limited to
          calendars, so bzzy never asks the server for anything else. Disconnecting deletes the password; you can also
          revoke it at account.apple.com.
        </p>

        <H>Who else handles it</H>
        <ul>
          <li>Vercel hosts the app and its file storage.</li>
          <li>Neon hosts the database.</li>
          <li>Resend sends bzzy&apos;s emails.</li>
          <li>Cloudflare checks the contact form isn&apos;t a bot (Turnstile). It sees your browser and IP address, not your message.</li>
          <li>GitHub and Google, when you sign in with them or connect them.</li>
        </ul>
        <p>These services may keep data outside Canada. bzzy doesn&apos;t sell or rent your data to anyone.</p>

        <H>Deleting it</H>
        <p>
          Remove a calendar or disconnect an account in Settings and its data is deleted straight away. To delete your
          whole account, email{" "}
          <a className="underline underline-offset-2" href="mailto:hello@bzzy.ca">
            hello@bzzy.ca
          </a>
          .
        </p>

        <p>
          See also the{" "}
          <Link className="underline underline-offset-2" href="/terms">
            terms
          </Link>
          .
        </p>

        <H>Questions</H>
        <p>
          Email{" "}
          <a className="underline underline-offset-2" href="mailto:hello@bzzy.ca">
            hello@bzzy.ca
          </a>
          .
        </p>
      </div>
    </main>
  );
}
