import { signInWithGitHub } from "@/app/actions";

import { PasskeySignIn } from "./passkey-buttons";

export function SignIn() {
  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <h1 className="text-xl font-semibold">Sign in to bzzy</h1>
      <p className="mt-1 text-sm text-muted">
        Set your desk light from your phone or laptop. First time here? Sign in with GitHub, then add a passkey in
        Settings.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <form action={signInWithGitHub}>
          <button className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
            Continue with GitHub
          </button>
        </form>
        <PasskeySignIn />
      </div>
    </div>
  );
}
