"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// bzzy follows the system light/dark setting (no theme toggle, so no next-themes), and
// keeps sonner's own small icons rather than pulling in an icon library.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
