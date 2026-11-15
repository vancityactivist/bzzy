import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BzzyMark } from "@/components/brand";
import { buttonClass, Card } from "@/components/ui";
import { formatPairCode, normalizePairCode } from "@/lib/pair-rules";
import { lookupPairing, pairingTeams } from "@/lib/pairing";
import { getCurrentUser } from "@/lib/session";

import { ClaimForm, SignInToPair } from "../pair-forms";

export const metadata: Metadata = { title: "Add a light", robots: { index: false } };

// Where the QR code on a new light's screen goes. See docs/protocol.md, "Pairing".
export default function PairCodePage(props: PageProps<"/pair/[code]">) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-20">
      <Suspense fallback={<p className="text-center text-muted">Loading…</p>}>
        <PairContent {...props} />
      </Suspense>
    </div>
  );
}

function Header({ title, code, children }: { title: string; code?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <BzzyMark className="size-11" />
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">{title}</h1>
      {code && (
        <p className="mt-2 rounded-lg bg-subtle px-3 py-1 font-mono text-sm tracking-[0.2em]" aria-label={`Code ${code.split("").join(" ")}`}>
          {formatPairCode(code)}
        </p>
      )}
      {children && <p className="mt-2 text-sm text-pretty text-muted">{children}</p>}
    </div>
  );
}

function TryAgain() {
  return (
    <Link href="/pair" className={buttonClass("secondary", "md", "mt-6 w-full")}>
      Type a code instead
    </Link>
  );
}

async function PairContent({ params }: PageProps<"/pair/[code]">) {
  const raw = (await params).code;
  // The session first: it marks the page as request-time before the lookup reads the clock.
  const user = await getCurrentUser();
  const code = normalizePairCode(decodeURIComponent(raw));
  const pairing = code ? await lookupPairing(code) : null;

  if (!code || !pairing || pairing.state === "expired") {
    return (
      <Card className="p-6 sm:p-8">
        <Header title={pairing ? "This code has run out" : "This code doesn't work"}>
          {pairing
            ? "Codes last 15 minutes. The light shows a new one by itself: scan that instead."
            : "Check the code on the light's screen. It changes every 15 minutes."}
        </Header>
        <TryAgain />
      </Card>
    );
  }

  if (pairing.state === "claimed") {
    return (
      <Card className="p-6 sm:p-8">
        <Header title="This light has been added">It should say “Paired” on its screen in a few seconds.</Header>
        {user && (
          <Link href="/devices" className={buttonClass("primary", "md", "mt-6 w-full")}>
            Open Devices
          </Link>
        )}
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="p-6 sm:p-8">
        <Header title="Add this light to bzzy" code={code}>
          Sign in first. The light waits for you.
        </Header>
        <div className="mt-6">
          <SignInToPair code={code} />
        </div>
        <p className="mt-6 border-t border-line pt-4 text-center text-xs text-pretty text-muted">
          New to bzzy? Continue with GitHub to make an account, or ask a teammate for an invite.
        </p>
      </Card>
    );
  }

  const teams = await pairingTeams(user.id, user.name);
  return (
    <Card className="p-6 sm:p-8">
      <Header title="Add this light" code={code}>
        Check this code matches the light&apos;s screen.
      </Header>
      <div className="mt-6">
        <ClaimForm code={code} teams={teams} />
      </div>
    </Card>
  );
}
