import { signOutAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <form action={signOutAction} className="flex items-center gap-3">
      <span className="text-muted">{user.name}</span>
      <button className="rounded-md border border-line px-2 py-1 hover:bg-card">Sign out</button>
    </form>
  );
}
