import { APP_NAME } from "@/lib/config/brand";

/** Token-driven wordmark. The brand package replaces this file only. A trailing "IA" is tinted with the accent. */
export function Logo({ className }: { className?: string }) {
  const tinted = APP_NAME.endsWith("IA");
  const base = tinted ? APP_NAME.slice(0, -2) : APP_NAME;
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="text-primary">
        <path d="M3 11.5L12 4l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-8.5z" fill="currentColor" />
        <circle cx="19" cy="5" r="3" className="fill-accent" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight">
        {base}
        {tinted && <span className="ml-px font-mono font-extrabold text-accent">IA</span>}
      </span>
    </span>
  );
}
