"use client";

import { useId, useRef, useState } from "react";
import { Button, CrossIcon, FileIcon, cx } from "./ui";

/** Mirrors lib/agents/uploads.ts (the server re-checks everything, by magic bytes). */
const MAX_FILES = 6;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf";
const EXT = /\.(png|jpe?g|webp|pdf)$/i;

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function problem(files: File[]): string | null {
  if (files.length > MAX_FILES) return `Choose at most ${MAX_FILES} files.`;
  if (files.some((f) => !EXT.test(f.name))) return "Only PNG, JPEG, WebP or PDF files.";
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES) return "The files together must be under 4 MB.";
  return null;
}

/**
 * Real document upload for the DOCUMENTS stage. Files go to /api/upload, are reviewed in memory and never stored.
 * The simulated "Upload my documents" chip stays available next to it.
 */
export function UploadDocuments({ busy, onSubmit }: { busy: boolean; onSubmit: (files: File[]) => void }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const error = problem(files);

  const submit = () => {
    if (files.length === 0 || error || busy) return;
    onSubmit(files);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section aria-label="Upload documents" className="mb-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <FileIcon className="size-4 shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-xs text-muted">
          <span className="font-semibold text-foreground">Upload your files.</span>
          <span className="hidden sm:inline"> ID, payslip, income certificate and guarantee, all at once.</span>
          <span className="block">PNG, JPEG, WebP or PDF, 4 MB in total. Never stored. Demo · simulated data.</span>
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT}
          className="peer sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <label
          htmlFor={inputId}
          className={cx(
            "inline-flex shrink-0 cursor-pointer items-center rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-sunken peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
            busy && "pointer-events-none opacity-50",
          )}
        >
          Choose files
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected files">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex max-w-full items-center gap-1.5 rounded-full bg-sunken py-1 pl-2.5 pr-1 text-xs"
              >
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-subtle">{kb(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-border hover:text-foreground"
                >
                  <CrossIcon className="size-3" strokeWidth={3} />
                  <span className="sr-only">Remove {f.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={busy || Boolean(error)} className="px-3 py-1.5 text-xs">
              Review {files.length === 1 ? "document" : `${files.length} documents`}
            </Button>
            {error && (
              <p role="alert" className="text-xs font-semibold text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
