import { createHash } from "node:crypto";

/** sha256 of the UTF-8 bytes of `text`, lowercase hex (64 chars). */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
