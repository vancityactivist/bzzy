import type { Metadata } from "next";

import { BzzyMark } from "@/components/brand";
import { Card } from "@/components/ui";

import { EnterCodeForm } from "./pair-forms";

export const metadata: Metadata = { title: "Add a light", robots: { index: false } };

// For typing the code off a light's screen, when scanning its QR code isn't handy.
export default function PairPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <BzzyMark className="size-11" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Add a light</h1>
          <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
            Plug the light in and connect it to Wi-Fi. It then shows a QR code and a short code. Scan the QR code, or type the code here.
          </p>
        </div>
        <div className="mt-6">
          <EnterCodeForm />
        </div>
      </Card>
    </div>
  );
}
