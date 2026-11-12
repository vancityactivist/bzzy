import type { SVGProps } from "react";

// A few extra 24x24 stroke icons for the landing page only, drawn to match icons.tsx
// (1.75 stroke, round caps and joins, currentColor, decorative).

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ className, children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-5"}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Wi-Fi with an arrow going out: the light only ever calls out. */
export function WifiOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 9.5a14 14 0 0 1 15-2.6M5.5 13a9.5 9.5 0 0 1 9.6-2.2M8.75 16.25a5 5 0 0 1 5-1.2" />
      <path d="M11.5 19.5h.01" />
      <path d="M16.5 14.5 21 10M17 10h4v4" />
    </Icon>
  );
}

/** A plug on a cable. */
export function PlugIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3v4M15 3v4" />
      <path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0V7Z" />
      <path d="M12 16v2.5a2.5 2.5 0 0 0 2.5 2.5H17" />
    </Icon>
  );
}

/** A speech bubble with a line of text. */
export function MessageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
      <path d="M7.5 9h9M7.5 12.5h5.5" />
    </Icon>
  );
}

/** A wrench: build your own. */
export function WrenchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </Icon>
  );
}

/** A pointing hand, for "tap". */
export function TapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 13V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12.5 10.5a1.5 1.5 0 0 1 3 0V12M15.5 11.5a1.5 1.5 0 0 1 3 0v3.5a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-4-2l-2.4-3.2a1.5 1.5 0 0 1 2.3-1.9L9.5 15.5" />
    </Icon>
  );
}

/** An arrow to the right. */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}
