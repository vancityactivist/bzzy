import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ChevronRightIcon, DeviceIcon } from "@/components/icons";
import { SignIn } from "@/components/sign-in";
import { Card, CardHeader, Container, EmptyState, PageHeader } from "@/components/ui";
import { type DeviceSummary, devicesForUser } from "@/lib/devices";
import { firmwareState } from "@/lib/firmware";
import { releaseForPage } from "@/lib/firmware-release";
import { nowSeconds } from "@/lib/protocol";
import { getCurrentUser } from "@/lib/session";

import { AddDeviceForm } from "./device-forms";
import { LightRow, lightSummary, teamLabel } from "./light-row";

export const metadata: Metadata = { title: "Lights" };

export default function LightsPage() {
  return (
    <Container size="narrow">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <LightsContent />
      </Suspense>
    </Container>
  );
}

async function LightsContent() {
  const user = await getCurrentUser();
  if (!user) return <SignIn />;
  const [devices, release] = await Promise.all([devicesForUser(user.id), releaseForPage()]);
  const now = nowSeconds() * 1000;
  const mine = devices.filter((d) => d.ownerUserId === user.id);
  const fw = (d: DeviceSummary) => {
    const s = firmwareState(d.firmware, release?.manifest, nowSeconds());
    return s.kind === "available" ? "update ready" : s.kind === "updating" ? "updating" : s.kind === "failed" ? "update failed" : null;
  };
  const managed = devices.length - mine.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lights"
        description="Each light follows you unless you give it a status of its own. How they look is set once, on the Look page."
      />

      {mine.length > 0 ? (
        <Card className="p-2 sm:p-2">
          <ul className="divide-y divide-line">
            {mine.map((d) => (
              <LightRow key={d.id} d={d} now={now} line={lightSummary(d, teamLabel(d), fw(d))} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<DeviceIcon />} title="No lights yet">
          A bzzy light sits on your desk or door and glows with your status. Plug a new one in and follow its screen: it
          walks you through Wi-Fi, then shows a code to scan that adds it here.
        </EmptyState>
      )}

      {managed > 0 && (
        <p className="text-sm text-muted">
          Lights of people in teams you run are on each{" "}
          <Link href="/teams" className="font-medium text-foreground underline underline-offset-2">
            team&apos;s page
          </Link>
          .
        </p>
      )}

      <Card id="add-device" className="scroll-mt-20">
        <CardHeader
          title="Add a light"
          description={
            <>
              Plug it in and follow its screen. Once it&apos;s on Wi-Fi it shows a code: scan it with your phone, or type it at{" "}
              <Link href="/pair" className="font-medium text-foreground underline underline-offset-2">
                bzzy.ca/pair
              </Link>
              . It follows you and uses your look straight away.
            </>
          }
        />
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="-mx-2 flex h-8 w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors select-none hover:bg-subtle hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-4 transition-transform duration-150 group-open:rotate-90" />
            Set one up by hand
          </summary>
          <div className="mt-3">
            <AddDeviceForm />
          </div>
        </details>
      </Card>
    </div>
  );
}
