import { signInWithGitHub } from "@/app/actions";

import { BzzyMark } from "./brand";
import { GithubIcon } from "./icons";
import { PasskeySignIn } from "./passkey-buttons";
import { Button, Card } from "./ui";

/**
 * The sign-in card: GitHub (a server action) or a passkey. On its own it centres itself
 * with page padding; pass bare to place the card yourself (the landing page does).
 */
export function SignIn({ bare = false }: { bare?: boolean }) {
  const card = (
    <Card className="w-full p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <BzzyMark className="size-11" />
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Sign in to bzzy</h2>
        <p className="mt-1.5 text-sm text-pretty text-muted">Set your desk light from your phone or laptop.</p>
      </div>
      <div className="mt-6 space-y-2.5">
        <form action={signInWithGitHub}>
          <Button variant="primary" className="w-full">
            <GithubIcon />
            Continue with GitHub
          </Button>
        </form>
        <PasskeySignIn />
      </div>
      <p className="mt-6 border-t border-line pt-4 text-center text-xs text-pretty text-muted">
        First time here? Sign in with GitHub, then add a passkey in Settings.
      </p>
    </Card>
  );
  if (bare) return card;
  return <div className="mx-auto w-full max-w-sm px-4 py-12 sm:py-20">{card}</div>;
}
