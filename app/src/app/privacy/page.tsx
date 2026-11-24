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

const UPDATED = "November 23, 2026";

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
            About each light: its name, firmware version, board type and when it last checked in. Your Wi-Fi name and
            password stay on the light and are never sent to bzzy.
          </li>
          <li>API tokens and light tokens, stored only as one-way hashes, and the webhook addresses you add.</li>
          <li>
            From calendars you connect: the start and end time, free/busy state and title of events in the next eight
            days. Titles are only shown on a light if you turn that on.
          </li>
          <li>
            For a connected calendar account: the account&apos;s email address or login and its access token or
            app-specific password, encrypted before it&apos;s stored. For an ICS link: the link itself, kept private.
          </li>
        </ul>

        <H>Who can see what</H>
        <p>
          People on your teams see your name, picture and status, and any message you choose to show. They never see your
          calendars or events. Team owners and admins can manage the team&apos;s lights and members, and a team keeps a log of
          those changes. Anything you send to a webhook goes to the address you gave.
        </p>

        <H>Google user data</H>
        <p>
          This section covers data bzzy gets from Google when you connect a Google account to use your Google Calendar.
          Connecting is optional. Signing in to bzzy never uses Google.
        </p>
        <p>
          <strong>What bzzy accesses.</strong> bzzy asks Google for these permissions, all read-only:
        </p>
        <ul>
          <li>
            Your Google account&apos;s email address and account id (<code>openid</code>,{" "}
            <code>userinfo.email</code>), so you can see which account is connected and reconnecting updates it.
          </li>
          <li>
            The list of your calendars: each calendar&apos;s name, id and colour (<code>calendar.calendarlist.readonly</code>).
          </li>
          <li>
            Events on the calendars you turn on, for the next eight days: start and end time, whether the event shows you
            as free or busy, its type (such as focus time or out of office), its title and id, and your own reply to the
            invitation (bzzy looks through the guest list only to find your reply, and doesn&apos;t keep it) (
            <code>calendar.events.readonly</code>).
          </li>
        </ul>
        <p>
          bzzy can&apos;t change your calendar, and never reads your Gmail, contacts, Drive files or anything else in your
          Google account.
        </p>
        <p>
          <strong>How bzzy uses it.</strong> Only to work out your status (busy, away, do not disturb) and when it ends, and,
          only if you turn it on for a calendar, to show the meeting title on your own lights. Nothing else.
        </p>
        <p>
          <strong>What bzzy stores.</strong> The account&apos;s email address and id, an encrypted refresh token, your
          calendars&apos; names, ids and colours, and for each event in the next eight days only its start, end, title, id
          and the status bzzy worked out from it. Older events are dropped every time the calendar refreshes. Guest lists,
          descriptions, locations and attachments are never stored.
        </p>
        <p>
          <strong>Sharing, transfer and disclosure.</strong> bzzy does not sell Google user data, and does not share,
          transfer or disclose it to anyone, except:
        </p>
        <ul>
          <li>
            The service providers that run bzzy and process it on bzzy&apos;s behalf, only to provide the service: Vercel
            (hosting, where the app runs and keeps a short-lived server cache) and Neon (the database). Both store data in
            the United States. bzzy&apos;s email and bot-check providers (Resend, Cloudflare) never receive Google data.
          </li>
          <li>
            Where you ask for it: your own lights, and, if you turn titles on, your own API tokens and webhooks, which
            can read your current status and meeting title. Teammates see your status and when it ends, never your
            calendars, event titles or event details.
          </li>
          <li>
            Where the law requires it, or where it&apos;s needed to protect the security of bzzy and its users.
          </li>
        </ul>
        <p>
          Google user data is never used for advertising, never used to build profiles of you, never used to train AI or
          machine-learning models, and never sold to data brokers or anyone else. Nobody reads it unless you ask for help
          and agree, it&apos;s needed for security or abuse, or the law requires it.
        </p>
        <p>
          <strong>Limited Use.</strong> bzzy&apos;s use and transfer to any other app of information received from Google
          APIs will adhere to the{" "}
          <a
            className="underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Removing it.</strong> Disconnect the account in Settings at any time: bzzy tells Google to revoke its
          access and deletes the token, the account&apos;s calendars and their saved events straight away. Deleting your bzzy
          account does the same. You can also remove bzzy from your Google Account at{" "}
          <a className="underline underline-offset-2" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          ; bzzy then stops reading and asks you to reconnect.
        </p>

        <H>How your data is protected</H>
        <ul>
          <li>
            In transit: bzzy.ca only accepts HTTPS, and bzzy only talks to Google, Neon and calendar servers over encrypted
            (TLS) connections.
          </li>
          <li>
            At rest: Vercel and Neon encrypt stored data on disk. On top of that, bzzy encrypts Google refresh tokens,
            access tokens and calendar passwords itself (AES-256-GCM) before storing them, with a key kept only in the
            hosting environment, so a copy of the database alone can&apos;t open them. Tokens are never sent to your browser.
          </li>
          <li>
            Access: only you can see your calendars in the app. Every request checks you are signed in and that the data is
            yours. Access to the hosting and database is limited to Adam Glover, through a single Vercel login protected by two-factor authentication and a passkey.
          </li>
          <li>
            Minimum data: read-only permissions, only the next eight days of events, and nothing kept once you disconnect.
          </li>
          <li>API tokens and light tokens are stored only as one-way hashes.</li>
        </ul>

        <H>iCloud and other calendar servers</H>
        <p>
          If you connect iCloud or another CalDAV server, bzzy uses the app-specific password you give it only to read
          your calendars, the same way as above. Apple&apos;s app-specific passwords can&apos;t be limited to
          calendars, so bzzy never asks the server for anything else. Disconnecting deletes the password; you can also
          revoke it at account.apple.com.
        </p>

        <H>The contact form</H>
        <p>
          Your name, email and message are emailed to us and not stored in the app. Your IP address is used, as a one-way
          hash, to stop more than a few messages a minute.
        </p>

        <H>Cookies and analytics</H>
        <p>
          bzzy uses a sign-in cookie to keep you signed in, and nothing for advertising or tracking. Vercel Web Analytics and
          Speed Insights count page views and page speed without cookies and without identifying you.
        </p>

        <H>Who else handles it</H>
        <ul>
          <li>Vercel hosts the app, its server cache and its file storage.</li>
          <li>Neon hosts the database.</li>
          <li>Resend sends bzzy&apos;s emails.</li>
          <li>Cloudflare checks the contact form isn&apos;t a bot (Turnstile). It sees your browser and IP address, not your message.</li>
          <li>GitHub and Google, when you sign in with them or connect them.</li>
          <li>GIPHY, when you use a GIPHY link: the GIF is loaded from GIPHY each time it&apos;s shown.</li>
          <li>The bzzy shop at shop.bzzy.ca, if you buy a light: it gives the app your email so the light arrives paired to you.</li>
        </ul>
        <p>
          These services store data in the United States, where it may be accessed under US law. bzzy doesn&apos;t sell or
          rent your data to anyone, and only emails you about your account and your teams.
        </p>

        <H>How long it&apos;s kept, and deleting it</H>
        <p>
          Everything is kept while you use bzzy. Calendar events are refreshed as they change and only the next eight days
          are kept. Remove a calendar or disconnect an account in Settings and its data is deleted straight away. To delete
          your whole account, email{" "}
          <a className="underline underline-offset-2" href="mailto:hello@bzzy.ca">
            hello@bzzy.ca
          </a>{" "}
          and it&apos;s deleted within 30 days. Hosting providers may keep short-lived logs and backups for a little longer.
        </p>

        <H>Your rights</H>
        <p>
          You can ask to see the information bzzy holds about you, correct it, or delete it, and you can withdraw your
          consent at any time (which may mean closing your account). Email{" "}
          <a className="underline underline-offset-2" href="mailto:hello@bzzy.ca">
            hello@bzzy.ca
          </a>{" "}
          and you&apos;ll get an answer within 30 days. If your information is ever exposed in a way that could harm you,
          you&apos;ll be told. The person responsible for privacy is Adam Glover. If you&apos;re not happy with the answer, you
          can complain to the{" "}
          <a className="underline underline-offset-2" href="https://www.oipc.bc.ca">
            Office of the Information and Privacy Commissioner for British Columbia
          </a>{" "}
          or the{" "}
          <a className="underline underline-offset-2" href="https://www.priv.gc.ca">
            Office of the Privacy Commissioner of Canada
          </a>
          .
        </p>

        <H>Children</H>
        <p>bzzy is made for work desks and isn&apos;t meant for children under 13.</p>

        <p>
          See also the{" "}
          <Link className="underline underline-offset-2" href="/terms">
            terms
          </Link>
          . Buying a light has its own{" "}
          <a className="underline underline-offset-2" href="https://shop.bzzy.ca/privacy">
            shop privacy policy
          </a>
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
