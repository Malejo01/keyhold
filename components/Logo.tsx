import { APP_NAME } from "@/lib/config/brand";
/** Placeholder wordmark. The brand package replaces this file only. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="text-primary">
        <path d="M3 11.5L12 4l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-8.5z" fill="currentColor" />
      </svg>
      <span className="font-display text-lg font-bold tracking-tight">{APP_NAME}</span>
    </span>
  );
}
