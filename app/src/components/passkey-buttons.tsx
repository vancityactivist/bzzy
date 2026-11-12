"use client";

import { signIn } from "next-auth/webauthn";
import { useState } from "react";

import { KeyIcon } from "./icons";
import { Button } from "./ui";

export function PasskeySignIn() {
  return (
    <Button type="button" className="w-full" onClick={() => signIn("passkey", { redirectTo: "/" })}>
      <KeyIcon />
      Use a passkey
    </Button>
  );
}

export function AddPasskey() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="primary"
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
      >
        <KeyIcon />
        {state === "busy" ? "Waiting for your device…" : "Add a passkey"}
      </Button>
      {state === "done" && <span className="text-sm" role="status">Passkey added.</span>}
      {state === "error" && <span className="text-sm text-danger" role="alert">That didn&apos;t work. Try again?</span>}
    </div>
  );
}
