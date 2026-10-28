import { createHash } from "node:crypto";

export type FingerprintInput = {
  text?: string | null;
  caption?: string | null;
  /** Telegram file unique ids / media identifiers when present. */
  mediaUniqueIds?: readonly string[];
};

/** Stable content fingerprint for forward matching (text/caption + media ids). */
export function contentFingerprint(input: FingerprintInput): string {
  const parts = [
    (input.text ?? "").trim(),
    (input.caption ?? "").trim(),
    ...(input.mediaUniqueIds ?? []).filter(Boolean).sort(),
  ];
  return createHash("sha256").update(parts.join("\0"), "utf8").digest("hex");
}
