"use client";

import { signIn } from "next-auth/webauthn";
import { useState } from "react";

export function PasskeySignIn() {
  return (
    <button
      onClick={() => signIn("passkey", { redirectTo: "/" })}
      className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-background"
    >
      Use a passkey
    </button>
  );
}

export function AddPasskey() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            await signIn("passkey", { action: "register", redirect: false });
            setState("done");
          } catch {
            setState("error");
          }
        }}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        Add a passkey
      </button>
      {state === "done" && <span className="text-sm text-free">Passkey added.</span>}
      {state === "error" && <span className="text-sm text-busy">That didn&apos;t work. Try again?</span>}
    </div>
  );
}
