import { createHash } from 'node:crypto';
import type { AiAttachment } from '../ai';

/**
 * Real document uploads (B7). Files live in memory for one request: nothing is written to disk or to public/.
 * Type is decided by magic bytes, never by extension or the client's declared MIME type.
 */

export const MAX_UPLOAD_FILES = 6;
/** Whole request. Vercel serverless bodies are capped at 4.5 MB, so this leaves room for the multipart envelope. */
export const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024;
const MIN_FILE_BYTES = 64;
const MAX_NAME_CHARS = 80;

export type UploadMime = AiAttachment['mimeType'];

export interface UploadedDocument {
  /** Sanitised display name. Still escaped with escapeForTag wherever it enters a prompt. */
  fileName: string;
  mimeType: UploadMime;
  bytes: Uint8Array;
  /** sha256 hex of `bytes`. */
  sha256: string;
}

export type UploadErrorCode = 'empty' | 'too_large' | 'too_many' | 'unsupported_type' | 'active_content';

/** A rejected upload. `message` is safe to show to the user (it never echoes file content or names). */
export class UploadError extends Error {
  constructor(
    readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

/** PNG, JPEG, WebP and PDF by magic bytes. Anything else (SVG, HTML, executables, ...) is null. */
export function sniffMime(bytes: Uint8Array): UploadMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

/** Tokens that make a PDF active (scripts, launch actions, attachments). We never render PDFs, but we do not forward them either. */
const PDF_ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|EmbeddedFile)\b/;

function hasActivePdfContent(bytes: Uint8Array): boolean {
  return PDF_ACTIVE_CONTENT.test(Buffer.from(bytes).toString('latin1'));
}

/**
 * Display-safe file name: basename only, NFKC-normalised, control and bidi characters dropped, anything outside
 * letters, digits, space and `. _ - ( )` replaced by `_`, at most 80 characters (extension kept).
 */
export function sanitizeFileName(raw: string): string {
  const base = (raw.split(/[\/]/).pop() ?? '').normalize('NFKC');
  const noControls = base.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  const safe = noControls.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!safe) return 'document';
  if (safe.length <= MAX_NAME_CHARS) return safe;
  const dot = safe.lastIndexOf('.');
  const ext = dot > 0 && safe.length - dot <= 6 ? safe.slice(dot) : '';
  return `${safe.slice(0, MAX_NAME_CHARS - ext.length)}${ext}`;
}

/** Validates one file and returns the in-memory document. Throws UploadError. */
export function toUploadedDocument(rawName: string, bytes: Uint8Array): UploadedDocument {
  if (bytes.length < MIN_FILE_BYTES) throw new UploadError('empty', 'One of the files is empty or too small to be a document.');
  if (bytes.length > MAX_UPLOAD_TOTAL_BYTES) throw new UploadError('too_large', 'That file is larger than 4 MB.');
  const mimeType = sniffMime(bytes);
  if (!mimeType) throw new UploadError('unsupported_type', 'Only PNG, JPEG, WebP and PDF files are accepted.');
  if (mimeType === 'application/pdf' && hasActivePdfContent(bytes)) {
    throw new UploadError('active_content', 'PDFs with scripts or embedded files are not accepted.');
  }
  return {
    fileName: sanitizeFileName(rawName),
    mimeType,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

/** Whole-request limits: file count and total size. Throws UploadError. */
export function assertUploadLimits(sizes: readonly number[]): void {
  if (sizes.length === 0) throw new UploadError('empty', 'Choose at least one file.');
  if (sizes.length > MAX_UPLOAD_FILES) throw new UploadError('too_many', `Upload at most ${MAX_UPLOAD_FILES} files at once.`);
  if (sizes.reduce((a, b) => a + b, 0) > MAX_UPLOAD_TOTAL_BYTES) throw new UploadError('too_large', 'The files together are larger than 4 MB.');
}

export function toAttachments(docs: readonly UploadedDocument[]): AiAttachment[] {
  return docs.map((d) => ({ mimeType: d.mimeType, data: d.bytes, sha256: d.sha256 }));
}
