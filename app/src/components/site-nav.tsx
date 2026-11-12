"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { DeviceIcon, type IconProps, ImageIcon, SlidersIcon, StatusIcon } from "./icons";
import { cx } from "./ui";

// The signed-in app's sections: pills in the header from sm up, a bottom tab bar on phones.

const SECTIONS: { href: string; label: string; icon: ComponentType<IconProps> }[] = [
  { href: "/", label: "Status", icon: StatusIcon },
  { href: "/devices", label: "Devices", icon: DeviceIcon },
  { href: "/gifs", label: "GIFs", icon: ImageIcon },
  { href: "/settings", label: "Settings", icon: SlidersIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cx("items-center gap-1", className)}>
      {SECTIONS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors duration-150",
              active ? "bg-subtle text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 sm:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg backdrop-saturate-150 sm:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
          {SECTIONS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors duration-150",
                    active ? "text-foreground" : "text-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cx(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
                      active && "bg-subtle",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
