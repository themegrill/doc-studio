/**
 * Screenshot compliance check (DOCSTUDIO-45, guideline §3).
 *
 * Shared by the editor (which runs it before an upload starts, so feedback is
 * instant and no bandwidth is wasted) and by /api/upload (which runs it as the
 * actual rule). Every failing rule is reported at once rather than one at a
 * time, so the writer makes one trip back to Canva instead of three.
 *
 * We reject rather than auto-convert deliberately: resizing on the server would
 * silently re-crop or re-compress a screenshot in ways the author never sees,
 * and the guideline is explicit that composition happens on a 1150px canvas.
 */

import type { EditorialGuidelines } from "./guidelines";
import { IMAGE_MIME, readImageInfo, type ImageInfo } from "./image-dimensions";

export interface ImageCheckResult {
  ok: boolean;
  /** One human-readable sentence per failing rule, each naming the actual value. */
  failures: string[];
  /** Non-blocking notes, e.g. over the preferred size but under the maximum. */
  notes: string[];
  info: ImageInfo;
  sizeKb: number;
}

const formatKb = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

const formatNames = (mimeTypes: string[]) =>
  mimeTypes
    .map((mime) => (mime.split("/")[1] ?? mime).toUpperCase())
    .join(" or ");

/**
 * @param header  the first bytes of the file — 64KB is plenty, and is all the
 *                editor needs to read before deciding whether to upload
 * @param byteLength  the true total file size in bytes
 */
export function checkImage(
  header: Uint8Array,
  byteLength: number,
  guidelines: EditorialGuidelines,
): ImageCheckResult {
  const info = readImageInfo(header);
  const sizeKb = byteLength / 1024;
  const failures: string[] = [];
  const notes: string[] = [];
  const rules = guidelines.images;

  // SVG is vector — width and file-size rules do not meaningfully apply.
  if (info.format === "svg") {
    return { ok: true, failures, notes, info, sizeKb };
  }

  const detectedMime =
    info.format === "unknown" ? null : IMAGE_MIME[info.format];

  if (detectedMime && !rules.allowedFormats.includes(detectedMime)) {
    failures.push(
      `Format must be ${formatNames(rules.allowedFormats)} — this is ${info.format.toUpperCase()}.`,
    );
  }

  if (info.width !== null) {
    if (rules.widthMode === "exact" && info.width !== rules.width) {
      failures.push(
        `Width must be ${rules.width}px — this is ${info.width}px.`,
      );
    } else if (rules.widthMode === "max" && info.width > rules.width) {
      failures.push(
        `Width must be ${rules.width}px or less — this is ${info.width}px.`,
      );
    }
  }

  if (sizeKb > rules.maxKb) {
    failures.push(
      `Size must be ${rules.maxKb} KB or less — this is ${formatKb(byteLength)}.`,
    );
  } else if (sizeKb > rules.targetKb) {
    notes.push(
      `${Math.round(sizeKb)} KB — under the ${rules.maxKb} KB maximum, but ${rules.targetKb} KB is preferred.`,
    );
  }

  return { ok: failures.length === 0, failures, notes, info, sizeKb };
}

/** One-line summary for a toast. */
export function describeImageFailures(result: ImageCheckResult): string {
  return result.failures.join(" ");
}
