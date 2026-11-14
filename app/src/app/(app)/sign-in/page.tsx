import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignIn } from "@/components/sign-in";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh]" aria-busy="true" />}>
      <SignInContent />
    </Suspense>
  );
}

async function SignInContent() {
  if (await getCurrentUser()) redirect("/");
  return <SignIn />;
}
