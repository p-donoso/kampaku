/**
 * @module tools/deliverable-inspection
 * Structured inspection of document, image, audio, video, and dataset deliverables.
 *
 * Everything here runs on Node builtins so a worker can verify non-code
 * deliverables in a clean environment. Capabilities that need an external
 * model or decoder (OCR, speech analysis, video frames, SQL) fail closed with an
 * explicit `unsupported` code instead of returning a guess.
 */

import { inflateRawSync, inflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";

export const INSPECTION_UNSUPPORTED_CODE = "INSPECTION_UNSUPPORTED";
export const INSPECTION_MALFORMED_CODE = "INSPECTION_MALFORMED";

export class InspectionError extends Error {
  constructor(
    message: string,
    readonly code: typeof INSPECTION_UNSUPPORTED_CODE | typeof INSPECTION_MALFORMED_CODE,
  ) {
    super(message);
    this.name = "InspectionError";
  }
}

function unsupported(capability: string, reason: string): never {
  throw new InspectionError(`${capability} is not available in this worker: ${reason}`, INSPECTION_UNSUPPORTED_CODE);
}

function malformed(message: string): never {
  throw new InspectionError(message, INSPECTION_MALFORMED_CODE);
}

const asBuffer = (input: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(input) ? input : Buffer.from(input);

/* ------------------------------------------------------------------ *
 * PDF: text extraction and structural inspection
 * ------------------------------------------------------------------ */

export interface PdfInspection {
  format: "pdf";
  version: string;
  pages: number;
  encrypted: boolean;
  textChars: number;
  text: string;
  truncated: boolean;
}

/**
 * Decodes literal strings inside PDF text-showing operators.
 *
 * PDF literal strings use backslash escapes and octal codes; this keeps the
 * common cases correct and ignores anything it cannot interpret.
 */
function decodePdfLiteral(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escape: string) => {
    switch (escape) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "(":
        return "(";
      case ")":
        return ")";
      case "\\":
        return "\\";
      default:
        return String.fromCharCode(Number.parseInt(escape, 8));
    }
  });
}

function contentStreams(buffer: Buffer): string[] {
  const latin = buffer.toString("latin1");
  const streams: string[] = [];
  const streamPattern = /stream\r?\n?([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(latin)) !== null) {
    const start = match.index + match[0].indexOf(match[1]);
    const slice = buffer.subarray(start, start + match[1].length);
    try {
      streams.push(inflateSync(slice).toString("latin1"));
      continue;
    } catch {
      // Not a Flate stream. Fall back to raw bytes when the payload looks like text.
    }
    if (/\(|T[jJ]/.test(match[1])) streams.push(match[1]);
  }

  return streams;
}

/**
 * Extracts text and structure from a PDF without external dependencies.
 *
 * Extracted text is the concatenation of Flate-decoded content-stream text
 * operators. It is sufficient to prove that a document contains expected
 * content; it is not a layout-faithful render.
 */
export function inspectPdf(input: Buffer | Uint8Array, maxChars = 20_000): PdfInspection {
  const buffer = asBuffer(input);
  const latin = buffer.toString("latin1");
  const header = latin.match(/^%PDF-(\d\.\d)/);
  if (!header) malformed("Not a PDF document: missing %PDF header.");

  const pieces: string[] = [];
  for (const stream of contentStreams(buffer)) {
    const showPattern = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    let show: RegExpExecArray | null;
    while ((show = showPattern.exec(stream)) !== null) {
      const arrayBody = show[1];
      if (arrayBody !== undefined) {
        const parts = arrayBody.match(/\((?:[^()\\]|\\.)*\)/g) ?? [];
        pieces.push(parts.map((part) => decodePdfLiteral(part.slice(1, -1))).join(""));
      } else if (show[2] !== undefined) {
        pieces.push(decodePdfLiteral(show[2]));
      }
    }
    if (/BT\b/.test(stream) && pieces.length > 0) pieces.push("\n");
  }

  const full = pieces.join("").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const text = full.slice(0, maxChars);

  return {
    format: "pdf",
    version: header[1]!,
    pages: (latin.match(/\/Type\s*\/Page\b/g) ?? []).length,
    encrypted: /\/Encrypt\b/.test(latin),
    textChars: full.length,
    text,
    truncated: full.length > text.length,
  };
}

/* ------------------------------------------------------------------ *
 * DOCX: text extraction and structural inspection
 * ------------------------------------------------------------------ */

interface ZipEntry {
  name: string;
  offset: number;
  compressedSize: number;
  method: number;
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const endSignature = 0x06054b50;
  let eocd = -1;
  for (let index = buffer.length - 22; index >= 0 && index > buffer.length - 66_000; index -= 1) {
    if (buffer.readUInt32LE(index) === endSignature) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) malformed("Not a ZIP container: central directory not found.");

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) malformed("Corrupt ZIP central directory entry.");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    entries.push({ name, offset: localOffset, compressedSize, method });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  if (buffer.readUInt32LE(entry.offset) !== 0x04034b50) malformed("Corrupt ZIP local header.");
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) {
    // Office packages store raw DEFLATE, but some producers wrap it in a zlib
    // header. Accept both so a valid document is never reported as corrupt.
    try {
      return inflateRawSync(data);
    } catch {
      return inflateSync(data);
    }
  }
  malformed(`Unsupported ZIP compression method: ${entry.method}.`);
}

export interface DocxInspection {
  format: "docx";
  paragraphs: number;
  headings: number;
  tables: number;
  words: number;
  textChars: number;
  text: string;
  truncated: boolean;
}

/**
 * Extracts text and structure from a DOCX package.
 *
 * Reads `word/document.xml` directly, so headings and tables are counted from
 * the real document model rather than from a conversion step.
 */
export function inspectDocx(input: Buffer | Uint8Array, maxChars = 20_000): DocxInspection {
  const buffer = asBuffer(input);
  const entries = readZipEntries(buffer);
  const documentEntry =
    entries.find((entry) => entry.name === "word/document.xml") ??
    entries.find((entry) => entry.name.endsWith("/document.xml"));
  if (!documentEntry) malformed("Not a DOCX document: word/document.xml is missing.");

  const xml = readZipEntry(buffer, documentEntry).toString("utf8");
  const paragraphs = xml.match(/<w:p[\s>]/g)?.length ?? 0;
  const tables = xml.match(/<w:tbl[\s>]/g)?.length ?? 0;
  const text = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .split(/<w:br\/>|<\/w:tr>/)
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const headings = xml.match(/w:val="Heading\d"/g)?.length ?? 0;
  return {
    format: "docx",
    paragraphs,
    headings,
    tables,
    words: text ? text.split(/\s+/).length : 0,
    textChars: text.length,
    text: text.slice(0, maxChars),
    truncated: text.length > maxChars,
  };
}

/* ------------------------------------------------------------------ *
 * Images: structure, blank detection, visual comparison
 * ------------------------------------------------------------------ */

export interface ImageInfo {
  format: "png" | "jpeg";
  width: number;
  height: number;
  bytes: number;
}

function pngInfo(buffer: Buffer): ImageInfo {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") malformed("Not a PNG image.");
  return {
    format: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  };
}

function jpegInfo(buffer: Buffer): ImageInfo {
  if (buffer.readUInt16BE(0) !== 0xffd8) malformed("Not a JPEG image.");
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1]!;
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        format: "jpeg",
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        bytes: buffer.length,
      };
    }
    offset += 2 + length;
  }
  malformed("JPEG frame header not found.");
}

export function inspectImage(input: Buffer | Uint8Array): ImageInfo {
  const buffer = asBuffer(input);
  if (buffer.length < 24) malformed("Image payload is too small to inspect.");
  return buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? pngInfo(buffer) : jpegInfo(buffer);
}

const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  pixels: Buffer;
}

/** Decodes a PNG into raw normalized RGBA rows for pixel-level comparison. */
function decodePng(buffer: Buffer): DecodedPng {
  const info = pngInfo(buffer);
  const bitDepth = buffer[24]!;
  const colorType = buffer[25]!;
  const interlace = buffer[28]!;
  if (bitDepth !== 8) unsupported("PNG pixel decoding", `bit depth ${bitDepth} is not supported (only 8-bit).`);
  if (interlace !== 0) unsupported("PNG pixel decoding", "interlaced PNG images are not supported.");
  const channels = PNG_CHANNELS[colorType];
  if (!channels) unsupported("PNG pixel decoding", `color type ${colorType} is not supported.`);

  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  if (idat.length === 0) malformed("PNG image has no IDAT data.");

  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = info;
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = raw[cursor]!;
    const line = Buffer.from(raw.subarray(cursor + 1, cursor + 1 + stride));
    cursor += 1 + stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? line[index - channels]! : 0;
      const up = previous[index]!;
      const upLeft = index >= channels ? previous[index - channels]! : 0;
      switch (filter) {
        case 1:
          line[index] = (line[index]! + left) & 0xff;
          break;
        case 2:
          line[index] = (line[index]! + up) & 0xff;
          break;
        case 3:
          line[index] = (line[index]! + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          line[index] = (line[index]! + predictor) & 0xff;
          break;
        }
        default:
          break;
      }
    }
    for (let column = 0; column < width; column += 1) {
      const source = column * channels;
      const target = (row * width + column) * 4;
      if (channels >= 3) {
        out[target] = line[source]!;
        out[target + 1] = line[source + 1]!;
        out[target + 2] = line[source + 2]!;
        out[target + 3] = channels === 4 ? line[source + 3]! : 255;
      } else {
        out[target] = line[source]!;
        out[target + 1] = line[source]!;
        out[target + 2] = line[source]!;
        out[target + 3] = channels === 2 ? line[source + 1]! : 255;
      }
    }
    previous = line;
  }

  return { width, height, channels, pixels: out };
}

export interface ImageVisualInspection {
  format: "png";
  width: number;
  height: number;
  /** Share of pixels that are not near-white, rounded to four decimals. */
  inkRatio: number;
  meanLuminance: number;
  /** True when the decoded pixels carry no meaningful content. */
  blank: boolean;
}

/** Reports whether a PNG actually rendered content instead of an empty canvas. */
export function inspectImageVisual(input: Buffer | Uint8Array): ImageVisualInspection {
  const decoded = decodePng(asBuffer(input));
  let ink = 0;
  let luminanceTotal = 0;
  const total = decoded.width * decoded.height;

  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    const r = decoded.pixels[offset]!;
    const g = decoded.pixels[offset + 1]!;
    const b = decoded.pixels[offset + 2]!;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminanceTotal += luminance;
    if (luminance < 245 || decoded.pixels[offset + 3]! < 250) ink += 1;
  }

  const inkRatio = total === 0 ? 0 : Number((ink / total).toFixed(4));
  const meanLuminance = total === 0 ? 0 : Number((luminanceTotal / total).toFixed(2));
  return {
    format: "png",
    width: decoded.width,
    height: decoded.height,
    inkRatio,
    meanLuminance,
    blank: inkRatio < 0.005,
  };
}

export interface ImageComparison {
  width: number;
  height: number;
  changedRatio: number;
  maxChannelDelta: number;
  identical: boolean;
}

/**
 * Compares two PNG images pixel by pixel.
 *
 * Both images must share the same dimensions so the comparison stays a real
 * visual diff instead of a scaled approximation.
 */
export function compareImages(
  left: Buffer | Uint8Array,
  right: Buffer | Uint8Array,
  threshold = 8,
): ImageComparison {
  const a = decodePng(asBuffer(left));
  const b = decodePng(asBuffer(right));
  if (a.width !== b.width || a.height !== b.height) {
    malformed(`Image sizes differ: ${a.width}x${a.height} versus ${b.width}x${b.height}.`);
  }

  const total = a.width * a.height;
  let changed = 0;
  let maxChannelDelta = 0;

  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    let delta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      delta = Math.max(delta, Math.abs(a.pixels[offset + channel]! - b.pixels[offset + channel]!));
    }
    maxChannelDelta = Math.max(maxChannelDelta, delta);
    if (delta > threshold) changed += 1;
  }

  const changedRatio = total === 0 ? 0 : Number((changed / total).toFixed(4));
  return {
    width: a.width,
    height: a.height,
    changedRatio,
    maxChannelDelta,
    identical: changed === 0,
  };
}

/** OCR needs an external model, so this capability fails closed. */
export function inspectImageText(): never {
  return unsupported("Image OCR", "no OCR provider is configured for this worker");
}

/* ------------------------------------------------------------------ *
 * Audio: duration, codec, and bounded signal statistics
 * ------------------------------------------------------------------ */

export interface AudioInspection {
  format: "wav" | "mp3";
  codec: string;
  channels: number;
  sampleRate: number;
  durationSeconds: number;
  bitrateKbps?: number;
  peak?: number;
  rms?: number;
  speechAnalysis: "unsupported";
}

function inspectWav(buffer: Buffer): AudioInspection {
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    malformed("Not a WAV file.");
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataOffset = body;
      dataLength = Math.min(size, buffer.length - body);
    }
    offset = body + size + (size % 2);
  }

  if (!channels || !sampleRate || dataOffset < 0) malformed("WAV file is missing fmt or data chunks.");
  if (bitsPerSample !== 16) {
    unsupported("WAV signal analysis", `only 16-bit PCM is supported, found ${bitsPerSample}-bit`);
  }

  const sampleCount = Math.floor(dataLength / 2);
  let peak = 0;
  let squareTotal = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(dataOffset + index * 2) / 32_768;
    peak = Math.max(peak, Math.abs(sample));
    squareTotal += sample * sample;
  }
  const frames = sampleCount / channels;

  return {
    format: "wav",
    codec: "pcm_s16le",
    channels,
    sampleRate,
    durationSeconds: Number((frames / sampleRate).toFixed(3)),
    peak: Number(peak.toFixed(4)),
    rms: sampleCount === 0 ? 0 : Number(Math.sqrt(squareTotal / sampleCount).toFixed(4)),
    speechAnalysis: "unsupported",
  };
}

const MP3_BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MP3_RATES_V1 = [44_100, 48_000, 32_000, 0];

function inspectMp3(buffer: Buffer): AudioInspection {
  if (!/^ID3/.test(buffer.subarray(0, 3).toString("ascii")) && buffer[0] !== 0xff) {
    malformed("Not an MP3 file.");
  }
  let offset = 0;
  if (/^ID3/.test(buffer.subarray(0, 3).toString("ascii"))) {
    const size = (buffer[6]! << 21) | (buffer[7]! << 14) | (buffer[8]! << 7) | buffer[9]!;
    offset = 10 + size;
  }

  while (offset + 4 < buffer.length) {
    if (buffer[offset] === 0xff && (buffer[offset + 1]! & 0xe0) === 0xe0) {
      const bitrateIndex = (buffer[offset + 2]! >> 4) & 0x0f;
      const sampleRateIndex = (buffer[offset + 2]! >> 2) & 0x03;
      const channelMode = (buffer[offset + 3]! >> 6) & 0x03;
      const bitrateKbps = MP3_BITRATES_V1[bitrateIndex]!;
      const sampleRate = MP3_RATES_V1[sampleRateIndex]!;
      if (bitrateKbps > 0 && sampleRate > 0) {
        return {
          format: "mp3",
          codec: "mpeg1-layer3",
          channels: channelMode === 3 ? 1 : 2,
          sampleRate,
          durationSeconds: Number(((buffer.length - offset) * 8 / (bitrateKbps * 1000)).toFixed(3)),
          bitrateKbps,
          speechAnalysis: "unsupported",
        };
      }
    }
    offset += 1;
  }
  malformed("MP3 frame header not found.");
}

export function inspectAudio(input: Buffer | Uint8Array): AudioInspection {
  const buffer = asBuffer(input);
  if (buffer.length < 12) malformed("Audio payload is too small to inspect.");
  return buffer.subarray(0, 4).toString("ascii") === "RIFF" ? inspectWav(buffer) : inspectMp3(buffer);
}

/** Waveform transcription needs a speech model, so this capability fails closed. */
export function transcribeAudio(): never {
  return unsupported("Audio speech analysis", "no speech model is configured for this worker");
}

/* ------------------------------------------------------------------ *
 * Video: container metadata
 * ------------------------------------------------------------------ */

export interface VideoInspection {
  format: "mp4";
  durationSeconds: number;
  width?: number;
  height?: number;
  tracks: number;
  brand?: string;
  frameExtraction: "unsupported";
  transcript: "unsupported";
}

interface Mp4Box {
  type: string;
  start: number;
  end: number;
  bodyStart: number;
}

function readBoxes(buffer: Buffer, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (size < 8) break;
    const boxEnd = Math.min(offset + size, end);
    boxes.push({ type, start: offset, end: boxEnd, bodyStart: offset + 8 });
    offset = boxEnd;
  }
  return boxes;
}

export function inspectVideo(input: Buffer | Uint8Array): VideoInspection {
  const buffer = asBuffer(input);
  if (buffer.length < 16) malformed("Video payload is too small to inspect.");
  const top = readBoxes(buffer, 0, buffer.length);
  const ftyp = top.find((box) => box.type === "ftyp");
  if (!ftyp) malformed("Not an MP4 container: ftyp box is missing.");

  const moov = top.find((box) => box.type === "moov");
  if (!moov) malformed("MP4 container has no moov box; metadata is unavailable.");

  const children = readBoxes(buffer, moov.bodyStart, moov.end);
  const mvhd = children.find((box) => box.type === "mvhd");
  if (!mvhd) malformed("MP4 moov box has no mvhd header.");

  const version = buffer[mvhd.bodyStart]!;
  const timescaleOffset = mvhd.bodyStart + (version === 1 ? 20 : 12);
  const durationOffset = timescaleOffset + 4;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(durationOffset))
    : buffer.readUInt32BE(durationOffset);

  const videoTrack = children
    .filter((box) => box.type === "trak")
    .flatMap((trak) => readBoxes(buffer, trak.bodyStart, trak.end))
    .find((box) => box.type === "tkhd");
  let width: number | undefined;
  let height: number | undefined;
  if (videoTrack) {
    const trackVersion = buffer[videoTrack.bodyStart]!;
    const sizeOffset = videoTrack.end - 8;
    width = Math.round(buffer.readUInt32BE(sizeOffset) / 65_536);
    height = Math.round(buffer.readUInt32BE(sizeOffset + 4) / 65_536);
    if (trackVersion > 1) {
      width = width || undefined;
      height = height || undefined;
    }
  }

  return {
    format: "mp4",
    durationSeconds: timescale === 0 ? 0 : Number((duration / timescale).toFixed(3)),
    width,
    height,
    tracks: children.filter((box) => box.type === "trak").length,
    brand: buffer.subarray(ftyp.bodyStart, ftyp.bodyStart + 4).toString("ascii"),
    frameExtraction: "unsupported",
    transcript: "unsupported",
  };
}

/* ------------------------------------------------------------------ *
 * Datasets: schema, invariants, and bounded queries
 * ------------------------------------------------------------------ */

export interface DatasetInspection {
  format: "csv" | "json";
  rows: number;
  columns: string[];
  schema: Record<string, "number" | "boolean" | "null" | "string">;
  nullCounts: Record<string, number>;
  duplicateRows: number;
  invariantViolations: string[];
  sample: Array<Record<string, unknown>>;
}

export interface DatasetQuery {
  /** Column to group or aggregate on. */
  column?: string;
  equals?: string;
  min?: number;
  max?: number;
  limit?: number;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift()?.map((name) => name.trim()) ?? [];
  if (header.length === 0) malformed("CSV file has no header row.");
  return rows
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function inferValue(raw: unknown): "number" | "boolean" | "null" | "string" {
  if (raw === null || raw === undefined || raw === "") return "null";
  if (typeof raw === "number") return "number";
  if (typeof raw === "boolean") return "boolean";
  const text = String(raw).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return "number";
  if (/^(?:true|false)$/i.test(text)) return "boolean";
  return "string";
}

/**
 * Inspects a CSV or JSON dataset: schema, nulls, duplicates, invariants, sample.
 *
 * @param format - `csv` or `json`.
 * @param text - Raw dataset text.
 * @param options - Optional uniqueness and monotonicity invariants to check.
 */
export function inspectDataset(
  format: "csv" | "json",
  text: string,
  options: { unique?: string[]; nonNegative?: string[] } = {},
): DatasetInspection {
  let rows: Array<Record<string, unknown>>;
  if (format === "csv") {
    rows = parseCsv(text);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      malformed("JSON dataset is not valid JSON.");
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)
        ? ((parsed as { rows: unknown[] }).rows)
        : malformed("JSON dataset must be an array of objects or an object with a rows array.");
    rows = list.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        malformed("JSON dataset rows must be objects.");
      }
      return entry as Record<string, unknown>;
    });
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const schema: DatasetInspection["schema"] = {};
  const nullCounts: Record<string, number> = {};

  for (const column of columns) {
    let kind: DatasetInspection["schema"][string] = "null";
    let nulls = 0;
    for (const row of rows) {
      const inferred = inferValue(row[column]);
      if (inferred === "null") {
        nulls += 1;
        continue;
      }
      if (kind === "null") kind = inferred;
      else if (kind !== inferred) kind = "string";
    }
    schema[column] = kind;
    nullCounts[column] = nulls;
  }

  const invariantViolations: string[] = [];
  for (const column of options.unique ?? []) {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = String(row[column] ?? "");
      if (key === "") continue;
      if (seen.has(key)) invariantViolations.push(`duplicate ${column}: ${key}`);
      seen.add(key);
    }
  }
  for (const column of options.nonNegative ?? []) {
    for (const row of rows) {
      const value = Number(row[column]);
      if (Number.isFinite(value) && value < 0) invariantViolations.push(`negative ${column}: ${value}`);
    }
  }

  const serialized = rows.map((row) => JSON.stringify(row));
  const duplicateRows = serialized.length - new Set(serialized).size;

  return {
    format,
    rows: rows.length,
    columns,
    schema,
    nullCounts,
    duplicateRows,
    invariantViolations,
    sample: rows.slice(0, 5),
  };
}

/** Filters dataset rows without loading a query engine. */
export function queryDataset(
  format: "csv" | "json",
  text: string,
  query: DatasetQuery,
): { matches: number; rows: Array<Record<string, unknown>> } {
  const rows = inspectDataset(format, text).sample;
  void rows;
  const all: Array<Record<string, unknown>> =
    format === "csv" ? parseCsv(text) : (JSON.parse(text) as Array<Record<string, unknown>>);
  const column = query.column;
  const matches = all.filter((row) => {
    if (!column) return true;
    if (query.equals !== undefined && String(row[column] ?? "") !== query.equals) return false;
    const numeric = Number(row[column]);
    if (query.min !== undefined && !(Number.isFinite(numeric) && numeric >= query.min)) return false;
    if (query.max !== undefined && !(Number.isFinite(numeric) && numeric <= query.max)) return false;
    return true;
  });
  return { matches: matches.length, rows: matches.slice(0, Math.max(1, Math.min(query.limit ?? 20, 100))) };
}

/** SQL queries need a database engine, so this capability fails closed. */
export function querySql(): never {
  return unsupported("SQL dataset queries", "this worker does not bundle a SQLite engine");
}

/** Reads and inspects a deliverable from disk. */
export async function inspectDeliverableFile(
  path: string,
  kind: "pdf" | "docx" | "image" | "audio" | "video" | "csv" | "json",
): Promise<unknown> {
  const buffer = await readFile(path);
  switch (kind) {
    case "pdf":
      return inspectPdf(buffer);
    case "docx":
      return inspectDocx(buffer);
    case "image":
      return inspectImageVisual(buffer);
    case "audio":
      return inspectAudio(buffer);
    case "video":
      return inspectVideo(buffer);
    case "csv":
      return inspectDataset("csv", buffer.toString("utf8"));
    case "json":
      return inspectDataset("json", buffer.toString("utf8"));
  }
}
