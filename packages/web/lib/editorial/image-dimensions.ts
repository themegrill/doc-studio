/**
 * Image dimension and format detection from file headers (DOCSTUDIO-45).
 *
 * Operates on a Uint8Array so the identical code runs in the browser (before an
 * upload starts) and on the server (as the actual rule). Reading the header
 * directly avoids adding `sharp`, which we do not otherwise need — we only
 * measure images, we never transform them.
 *
 * Only the first ~64 bytes are needed for WebP and PNG; JPEG needs a marker
 * walk, so pass at least the first 64KB for reliable results.
 */

export type ImageFormat = "webp" | "png" | "jpeg" | "gif" | "svg" | "unknown";

export interface ImageInfo {
  format: ImageFormat;
  width: number | null;
  height: number | null;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function readWebp(b: Uint8Array): ImageInfo {
  const info: ImageInfo = { format: "webp", width: null, height: null };
  if (b.length < 30) return info;

  const chunk = ascii(b, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: 3-byte frame tag, 3-byte start code, then 14-bit width/height.
    info.width = u16le(b, 26) & 0x3fff;
    info.height = u16le(b, 28) & 0x3fff;
  } else if (chunk === "VP8L") {
    // Lossless: 1-byte signature, then 14 bits width-1 and 14 bits height-1.
    const bits = u16le(b, 21) | (u16le(b, 23) << 16);
    info.width = (bits & 0x3fff) + 1;
    info.height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === "VP8X") {
    // Extended: 24-bit canvas width-1 and height-1.
    info.width = u24le(b, 24) + 1;
    info.height = u24le(b, 27) + 1;
  }

  return info;
}

function readPng(b: Uint8Array): ImageInfo {
  if (b.length < 24) return { format: "png", width: null, height: null };
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function readJpeg(b: Uint8Array): ImageInfo {
  const info: ImageInfo = { format: "jpeg", width: null, height: null };
  let i = 2;

  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];

    // Start-of-frame markers carry the dimensions; DHT/DAC/RST and friends don't.
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof) {
      info.height = u16be(b, i + 5);
      info.width = u16be(b, i + 7);
      return info;
    }

    // Standalone markers have no payload length to skip.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    const segmentLength = u16be(b, i + 2);
    if (segmentLength < 2) return info;
    i += 2 + segmentLength;
  }

  return info;
}

function readGif(b: Uint8Array): ImageInfo {
  if (b.length < 10) return { format: "gif", width: null, height: null };
  return { format: "gif", width: u16le(b, 6), height: u16le(b, 8) };
}

/** Identify format and dimensions from a file header. Never throws. */
export function readImageInfo(bytes: Uint8Array): ImageInfo {
  try {
    if (bytes.length < 12) return { format: "unknown", width: null, height: null };

    if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
      return readWebp(bytes);
    }
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return readPng(bytes);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return readJpeg(bytes);
    }
    if (ascii(bytes, 0, 3) === "GIF") {
      return readGif(bytes);
    }
    // SVG has no fixed magic number; look for the root element near the start.
    const head = ascii(bytes, 0, Math.min(bytes.length, 512)).toLowerCase();
    if (head.includes("<svg")) {
      return { format: "svg", width: null, height: null };
    }

    return { format: "unknown", width: null, height: null };
  } catch {
    return { format: "unknown", width: null, height: null };
  }
}

export const IMAGE_MIME: Record<Exclude<ImageFormat, "unknown">, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
};
