import type { ComponentProps, ReactNode } from "react";

import type { Status } from "@/lib/protocol";

import { ChevronDownIcon } from "./icons";

// Small, server-safe UI primitives. Every component takes className, which is appended last,
// so callers can adjust spacing and width. Focus rings come from the base :focus-visible style
// in globals.css.

/** Joins class names, skipping falsy ones. */
export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---- layout ----

/**
 * Page width and gutters. `main` in the layout is full-bleed; each page wraps its content in this.
 * size: "default" (max-w-5xl) or "narrow" (max-w-3xl, for form-ish pages).
 * padded: vertical page padding (py-8), on by default; turn off for full-bleed sections.
 */
export function Container({
  size = "default",
  padded = true,
  className,
  ...props
}: ComponentProps<"div"> & { size?: "default" | "narrow"; padded?: boolean }) {
  return (
    <div
      // "narrow" keeps the header's left edge and caps the content width with padding on the
      // right, so page titles line up with the wordmark.
      className={cx(
        "mx-auto w-full max-w-5xl px-4 sm:px-6",
        size === "narrow" && "lg:pr-[14.5rem]",
        padded && "py-8",
        className,
      )}
      {...props}
    />
  );
}

/** A page's h1, description and optional actions (right-aligned from sm up). */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---- buttons ----

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
/** sm = 32px, md = 40px; icon / icon-sm are square versions for icon-only buttons. */
export type ButtonSize = "sm" | "md" | "icon" | "icon-sm";

const BUTTON_BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[color,background-color,border-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background shadow-card hover:bg-foreground/85",
  secondary: "border border-line bg-card text-foreground shadow-card hover:border-line-strong hover:bg-subtle",
  ghost: "text-muted hover:bg-subtle hover:text-foreground",
  danger: "border border-line bg-card text-danger shadow-card hover:border-danger/40 hover:bg-danger/5",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-sm",
  md: "h-10 rounded-xl px-4 text-sm",
  icon: "size-10 rounded-xl",
  "icon-sm": "size-8 rounded-lg",
};

/** The button look as a class string, for <a> and <Link>. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

/**
 * A <button>. Like a plain <button>, it submits its form unless you pass type="button".
 * Icons inside are sized to 16px automatically.
 */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

// ---- cards ----

/** A raised surface: hairline border, subtle shadow, rounded-2xl. padding: "md" (default), "sm" or "none". */
export function Card({
  padding = "md",
  className,
  ...props
}: ComponentProps<"div"> & { padding?: "none" | "sm" | "md" }) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-card shadow-card",
        padding === "md" && "p-5 sm:p-6",
        padding === "sm" && "p-4",
        className,
      )}
      {...props}
    />
  );
}

/** Title (h2), description and optional actions at the top of a Card. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---- form controls ----

const CONTROL =
  "w-full rounded-xl border border-line bg-card text-sm text-foreground shadow-card transition-colors duration-150 placeholder:text-muted/70 hover:border-line-strong focus-visible:border-line-strong disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

/** A 40px text input. Also styles type="file" sensibly. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        CONTROL,
        "h-10 px-3",
        "file:mr-3 file:h-7 file:rounded-lg file:border-0 file:bg-subtle file:px-2.5 file:text-sm file:font-medium file:text-foreground",
        props.type === "file" && "py-1 pl-1.5",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(CONTROL, "min-h-20 px-3 py-2", className)} {...props} />;
}

/** A native <select> at 40px with a chevron. className goes on the select, wrapperClassName on its wrapper (w-full by default). */
export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <span className={cx("relative inline-flex w-full", wrapperClassName)}>
      <select className={cx(CONTROL, "h-10 appearance-none pl-3 pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cx("text-sm font-medium", className)} {...props} />;
}

/** A label, the control (children), then a hint or an error. Pass htmlFor matching the control's id. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

// ---- status ----

const STATUS_BG: Record<Status, string> = { free: "bg-free", busy: "bg-busy", dnd: "bg-dnd", away: "bg-away" };

/** The status colour as a dot. size: sm (8px), md (10px, default), lg (12px). Pass label to make it non-decorative. */
export function StatusDot({
  status,
  size = "md",
  label,
  className,
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-block shrink-0 rounded-full",
        STATUS_BG[status],
        size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5",
        className,
      )}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}

export type BadgeTone = "neutral" | "inverse" | Status;

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border border-line bg-subtle text-muted",
  inverse: "bg-foreground text-background",
  free: "bg-free/10 text-foreground ring-1 ring-inset ring-free/25",
  busy: "bg-busy/10 text-foreground ring-1 ring-inset ring-busy/25",
  dnd: "bg-dnd/10 text-foreground ring-1 ring-inset ring-dnd/25",
  away: "bg-away/10 text-foreground ring-1 ring-inset ring-away/25",
};

/**
 * A small pill. tone: neutral (default), inverse (solid foreground) or a status, which gets a
 * tinted background and a coloured dot (dot={false} hides it). Text stays foreground for contrast.
 */
export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; dot?: boolean }) {
  const isStatus = tone !== "neutral" && tone !== "inverse";
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {isStatus && dot !== false && <StatusDot status={tone} size="sm" />}
      {children}
    </span>
  );
}

// ---- empty state ----

/** A dashed box for "nothing here yet": icon, title, body and an optional action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-subtle text-muted [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="font-semibold tracking-tight">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
