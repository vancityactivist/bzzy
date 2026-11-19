"use client";

import Link from "next/link";

import { signOutAction } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { LogOutIcon, ShieldIcon } from "./icons";

// The avatar button in the header and its menu. Radix handles outside clicks, Escape,
// arrow keys and giving focus back to the button.
export function AccountMenu({ name, image, admin }: { name: string; image: string | null; admin: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Account: ${name}`}
        className="flex size-9 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-85"
      >
        <Avatar name={name} image={image} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60 rounded-2xl p-1.5">
        <DropdownMenuLabel className="flex items-center gap-3 px-2.5 pt-2 pb-3 font-normal">
          <Avatar name={name} image={image} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block text-xs text-muted-foreground">Signed in</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {admin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldIcon />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        {/* A server action, so the item submits a form rather than navigating. */}
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ name, image, className }: { name: string; image: string | null; className?: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- provider avatars from arbitrary hosts
      <img src={image} alt="" className={cn("size-8 shrink-0 rounded-full border object-cover", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold uppercase text-foreground",
        className,
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}
