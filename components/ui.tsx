import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";

/** Small presentational primitives. Server-safe (no hooks); styling comes from tokens only. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 select-none";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover disabled:hover:bg-primary aria-disabled:hover:bg-primary",
  secondary: "border border-border-strong bg-surface text-foreground hover:bg-sunken",
  ghost: "text-muted hover:bg-sunken hover:text-foreground",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" className={cx(buttonBase, buttonVariants[variant], className)} {...props} />;
}

// ---------- Badge ----------

type Tone = "neutral" | "success" | "warning" | "danger" | "accent" | "primary";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
  primary: "bg-primary-soft text-primary",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------- Card shell ----------

export function CardShell({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  /** Accessible name for the card region. */
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cx("relative rounded-lg border border-border bg-surface p-card shadow-sm", className)}
    >
      {children}
    </section>
  );
}

// ---------- Icons (inline SVG, currentColor) ----------

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const CrossIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
  </Svg>
);
export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12l16-8-6 16-3-7-7-1z" />
  </Svg>
);
export const BedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5" />
    <circle cx="7" cy="11" r="1.5" />
  </Svg>
);
export const PawIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6.5" cy="10" r="1.6" />
    <circle cx="10" cy="6.5" r="1.6" />
    <circle cx="14" cy="6.5" r="1.6" />
    <circle cx="17.5" cy="10" r="1.6" />
    <path d="M12 12c-3 0-5 2.5-5 4.5 0 1.5 1.3 2 2.6 2 1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.3 0 2.6-.5 2.6-2 0-2-2-4.5-5-4.5z" />
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6-5.6-6-10a6 6 0 1112 0c0 4.4-6 10-6 10z" />
    <circle cx="12" cy="11" r="2" />
  </Svg>
);
export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4M10 12h5M10 16h5" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
