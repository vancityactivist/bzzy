"use client";

import type { ReactNode } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { MoreIcon } from "./icons";

// A "⋯" button and a small menu of less-used actions. Keeps rare or destructive actions out
// of the way of the everyday ones. Radix handles outside clicks, Escape, arrow keys and focus.

export type MoreMenuItem = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void };

export function MoreMenu({ label, items, className }: { label: string; items: MoreMenuItem[]; className?: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
          className,
        )}
      >
        <MoreIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            disabled={item.disabled}
            variant={item.danger ? "destructive" : "default"}
            onSelect={item.onSelect}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
