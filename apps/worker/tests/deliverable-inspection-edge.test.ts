import { deflateSync, deflateRawSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  INSPECTION_MALFORMED_CODE,
  INSPECTION_UNSUPPORTED_CODE,
  InspectionError,
  compareImages,
  inspectAudio,
  inspectDataset,
  inspectDeliverableFile,
  inspectDocx,
  inspectImage,
  inspectImageVisual,
  inspectPdf,
  inspectVideo,
  queryDataset,
  transcribeAudio,
} from "../src/tools/deliverable-inspection.js";

/* ----------------------------- helpers ----------------------------- */

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zipChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

/** Builds a PNG with an explicit colour type, bit depth, and interlace flag. */
function buildPngWith(
  options: { width?: number; height?: number; colourType?: number; bitDepth?: number; interlace?: number; filter?: number },
): Buffer {
  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[options.colourType ?? 2] ?? 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (1 + stride), 40);
  for (let row = 0; row < height; row += 1) raw[row * (1 + stride)] = options.filter ?? 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = options.colourType ?? 2;
  ihdr[12] = options.interlace ?? 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    zipChunk("IHDR", ihdr),
    zipChunk("IDAT", deflateSync(raw)),
    zipChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngBytes(width: number, height: number, rgb: [number, number, number], filter = 0): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + stride)] = filter;
    for (let x = 0; x < width; x += 1) {
      const offset = y * (1 + stride) + 1 + x * 3;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    zipChunk("IHDR", ihdr),
    zipChunk("IDAT", deflateSync(raw)),
    zipChunk("IEND", Buffer.alloc(0)),
  ]);
}

function buildZip(entries: Array<{ name: string; data: Buffer; method?: number }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 8;
    const name = Buffer.from(entry.name, "utf8");
    const stored = method === 0 ? entry.data : deflateRawSync(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt32LE(stored.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += localHeader.length + name.length + stored.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

function expectInspectionError(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error("inspection should not succeed");
  } catch (error) {
    expect(error).toBeInstanceOf(InspectionError);
    expect((error as InspectionError).code).toBe(code);
  }
}

/* ------------------------------- tests ------------------------------- */

describe("deliverable inspection edge cases", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function workspace(): string {
    directory = mkdtempSync(join(tmpdir(), "kampaku-inspection-"));
    return directory;
  }

  describe("documents", () => {
    it("reads a DOCX whose document.xml lives at a nested path", () => {
      const xml = "<w:document><w:p><w:r><w:t>Nested document text</w:t></w:r></w:p></w:document>";
      const pkg = buildZip([{ name: "custom/document.xml", data: Buffer.from(xml, "utf8") }]);
      expect(inspectDocx(pkg).text).toContain("Nested document text");
    });

    it("reads a DOCX stored without compression", () => {
      const xml = "<w:document><w:p><w:r><w:t>Stored text</w:t></w:r></w:p></w:document>";
      const pkg = buildZip([{ name: "word/document.xml", data: Buffer.from(xml, "utf8"), method: 0 }]);
      expect(inspectDocx(pkg).text).toContain("Stored text");
    });

    it("rejects an unsupported ZIP compression method", () => {
      const pkg = buildZip([{ name: "word/document.xml", data: Buffer.from("x"), method: 12 }]);
      expectInspectionError(() => inspectDocx(pkg), INSPECTION_MALFORMED_CODE);
    });

    it("rejects a ZIP with a corrupt local header", () => {
      const pkg = buildZip([{ name: "word/document.xml", data: Buffer.from("<w:document/>", "utf8") }]);
      const corrupt = Buffer.from(pkg);
      corrupt.writeUInt32LE(0, 0);
      expectInspectionError(() => inspectDocx(corrupt), INSPECTION_MALFORMED_CODE);
    });

    it("extracts text from a PDF with a Tj array and octal escapes", () => {
      const content = "BT /F1 12 Tf [(Array) -250 (text)] TJ (\\101\\102) Tj ET";
      const stream = deflateSync(Buffer.from(content, "latin1"));
      const pdf = Buffer.concat([
        Buffer.from("%PDF-1.4\n", "latin1"),
        Buffer.from(`1 0 obj<</Length ${stream.length}>>stream\n`, "latin1"),
        stream,
        Buffer.from("\nendstream\nendobj\n/Encrypt 1\n", "latin1"),
      ]);
      const inspection = inspectPdf(pdf);
      expect(inspection.version).toBe("1.4");
      expect(inspection.text).toContain("Array");
      expect(inspection.encrypted).toBe(true);
    });

    it("truncates long extracted text and reports it", () => {
      const longText = "word ".repeat(500);
      const stream = deflateSync(Buffer.from(`BT (${longText}) Tj ET`, "latin1"));
      const pdf = Buffer.concat([
        Buffer.from("%PDF-1.7\n", "latin1"),
        Buffer.from("1 0 obj<<>>stream\n", "latin1"),
        stream,
        Buffer.from("\nendstream\n", "latin1"),
      ]);
      const inspection = inspectPdf(pdf, 50);
      expect(inspection.truncated).toBe(true);
      expect(inspection.text.length).toBe(50);
    });
  });

  describe("images", () => {
    it("decodes greyscale and greyscale-alpha PNG images", () => {
      expect(inspectImageVisual(buildPngWith({ colourType: 0 })).format).toBe("png");
      expect(inspectImageVisual(buildPngWith({ colourType: 4 })).format).toBe("png");
    });

    it("reports unsupported bit depth, interlace, and colour type", () => {
      expectInspectionError(() => inspectImageVisual(buildPngWith({ bitDepth: 16 })), INSPECTION_UNSUPPORTED_CODE);
      expectInspectionError(() => inspectImageVisual(buildPngWith({ interlace: 1 })), INSPECTION_UNSUPPORTED_CODE);
      expectInspectionError(() => inspectImageVisual(buildPngWith({ colourType: 3 })), INSPECTION_UNSUPPORTED_CODE);
    });

    it("reports a PNG without image data", () => {
      const empty = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        zipChunk("IHDR", (() => {
          const ihdr = Buffer.alloc(13);
          ihdr.writeUInt32BE(2, 0);
          ihdr.writeUInt32BE(2, 4);
          ihdr[8] = 8;
          ihdr[9] = 2;
          return ihdr;
        })()),
        zipChunk("IEND", Buffer.alloc(0)),
      ]);
      expectInspectionError(() => inspectImageVisual(empty), INSPECTION_MALFORMED_CODE);
    });

    it("decodes an image whose rows use a reconstruction filter", () => {
      const filtered = inspectImageVisual(pngBytes(3, 2, [10, 20, 30], 1));
      expect(filtered.width).toBe(3);
      expect(filtered.height).toBe(2);
      expect(filtered.blank).toBe(false);
    });

    it("compares images with a custom threshold", () => {
      const left = pngBytes(2, 2, [10, 10, 10]);
      const right = pngBytes(2, 2, [14, 14, 14]);
      expect(compareImages(left, right, 2).identical).toBe(false);
      expect(compareImages(left, right, 10).identical).toBe(true);
    });

    it("rejects a JPEG payload it cannot decode visually", () => {
      const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0]), Buffer.alloc(20)]);
      expectInspectionError(() => inspectImageVisual(jpeg), INSPECTION_MALFORMED_CODE);
    });

    it("reads JPEG dimensions from the frame header", () => {
      const header = Buffer.alloc(64);
      header.writeUInt16BE(0xffd8, 0);
      header.writeUInt8(0xff, 2);
      header.writeUInt8(0xc0, 3);
      header.writeUInt16BE(17, 4);
      header.writeUInt16BE(480, 7);
      header.writeUInt16BE(640, 9);
      expect(inspectImage(header)).toMatchObject({ format: "jpeg", width: 640, height: 480 });
    });

    it("rejects a JPEG without a frame header", () => {
      expectInspectionError(
        () => inspectImage(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(30)])),
        INSPECTION_MALFORMED_CODE,
      );
    });
  });

  describe("audio and video", () => {
    it("reports unsupported WAV sample widths", () => {
      const header = Buffer.alloc(44);
      header.write("RIFF", 0, "ascii");
      header.write("WAVE", 8, "ascii");
      header.write("fmt ", 12, "ascii");
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(8_000, 24);
      header.writeUInt16LE(8, 34);
      header.write("data", 36, "ascii");
      expectInspectionError(() => inspectAudio(header), INSPECTION_UNSUPPORTED_CODE);
    });

    it("reports a WAV without fmt or data chunks", () => {
      const header = Buffer.alloc(16);
      header.write("RIFF", 0, "ascii");
      header.write("WAVE", 8, "ascii");
      expectInspectionError(() => inspectAudio(header), INSPECTION_MALFORMED_CODE);
    });

    it("reads an MP3 with an ID3 tag", () => {
      const tag = Buffer.alloc(10 + 100);
      tag.write("ID3", 0, "ascii");
      const frame = Buffer.alloc(8);
      frame[0] = 0xff;
      frame[1] = 0xfb;
      frame[2] = 0x90;
      frame[3] = 0x00;
      const inspection = inspectAudio(Buffer.concat([tag, frame, Buffer.alloc(400)]));
      expect(inspection.format).toBe("mp3");
      expect(inspection.sampleRate).toBe(44_100);
    });

    it("reports an MP3 without a valid frame header", () => {
      expectInspectionError(() => inspectAudio(Buffer.from("\xff\xfb\x00\x00", "latin1")), INSPECTION_MALFORMED_CODE);
    });

    it("rejects a payload that is not MP3", () => {
      expectInspectionError(() => inspectAudio(Buffer.from("not audio data")), INSPECTION_MALFORMED_CODE);
    });

    it("reports speech analysis as unsupported", () => {
      expectInspectionError(() => transcribeAudio(), INSPECTION_UNSUPPORTED_CODE);
    });

    it("reports an MP4 without a video track header", () => {
      const mvhdBody = Buffer.alloc(100);
      mvhdBody.writeUInt32BE(1_000, 12);
      mvhdBody.writeUInt32BE(2_000, 16);
      const mvhd = Buffer.concat([
        Buffer.from([0, 0, 0, 8 + mvhdBody.length]),
        Buffer.from("mvhd", "ascii"),
        mvhdBody,
      ]);
      const moovBody = mvhd;
      const mp4 = Buffer.concat([
        Buffer.from([0, 0, 0, 16]),
        Buffer.from("ftyp", "ascii"),
        Buffer.from("isom", "ascii"),
        Buffer.from("mp42", "ascii"),
        Buffer.from([0, 0, 0, 8 + moovBody.length]),
        Buffer.from("moov", "ascii"),
        moovBody,
      ]);
      const inspection = inspectVideo(mp4);
      expect(inspection.durationSeconds).toBeCloseTo(2, 3);
      expect(inspection.width).toBeUndefined();
      expect(inspection.tracks).toBe(0);
    });

    it("rejects a video container without metadata", () => {
      expectInspectionError(() => inspectVideo(Buffer.alloc(4)), INSPECTION_MALFORMED_CODE);
    });
  });

  describe("datasets", () => {
    it("accepts a JSON dataset wrapped in a rows object", () => {
      const inspection = inspectDataset("json", JSON.stringify({ rows: [{ id: 1 }, { id: 2 }] }));
      expect(inspection.rows).toBe(2);
    });

    it("rejects JSON rows that are not objects", () => {
      expectInspectionError(() => inspectDataset("json", JSON.stringify([1, 2])), INSPECTION_MALFORMED_CODE);
      expectInspectionError(
        () => inspectDataset("json", JSON.stringify({ note: "no rows" })),
        INSPECTION_MALFORMED_CODE,
      );
    });

    it("rejects a JSON dataset that is neither an array nor a rows object", () => {
      expectInspectionError(() => inspectDataset("json", JSON.stringify("plain")), INSPECTION_MALFORMED_CODE);
    });

    it("infers booleans and mixed types", () => {
      const inspection = inspectDataset(
        "json",
        JSON.stringify([
          { flag: true, mixed: 1 },
          { flag: false, mixed: "two" },
        ]),
      );
      expect(inspection.schema.flag).toBe("boolean");
      expect(inspection.schema.mixed).toBe("string");
    });

    it("handles quoted CSV values and skips blank lines", () => {
      const inspection = inspectDataset("csv", 'name,note\n"alpha, beta","said ""hi"""\n\n');
      expect(inspection.rows).toBe(1);
      expect(inspection.sample[0]?.name).toBe("alpha, beta");
      expect(inspection.sample[0]?.note).toBe('said "hi"');
    });

    it("rejects an empty CSV file", () => {
      expectInspectionError(() => inspectDataset("csv", ""), INSPECTION_MALFORMED_CODE);
    });

    it("queries by equality, upper bound, and row limit", () => {
      const csv = "id,score\n1,10\n2,20\n3,30\n";
      expect(queryDataset("csv", csv, { column: "score", max: 20 }).matches).toBe(2);
      expect(queryDataset("csv", csv, { column: "id", equals: "2" }).rows[0]?.score).toBe("20");
      expect(queryDataset("csv", csv, { limit: 2 }).rows).toHaveLength(2);
      expect(queryDataset("csv", csv, {}).matches).toBe(3);
    });

    it("queries a JSON dataset", () => {
      const json = JSON.stringify([{ id: 1, score: 5 }, { id: 2, score: 15 }]);
      expect(queryDataset("json", json, { column: "score", min: 10 }).matches).toBe(1);
    });
  });

  describe("file inspection dispatch", () => {
    it("inspects each supported deliverable kind from disk", async () => {
      const root = workspace();
      writeFileSync(join(root, "data.csv"), "id,score\n1,2\n");
      writeFileSync(join(root, "data.json"), JSON.stringify([{ id: 1 }]));
      writeFileSync(join(root, "tiny.png"), pngBytes(2, 2, [1, 2, 3]));

      await expect(inspectDeliverableFile(join(root, "data.csv"), "csv")).resolves.toMatchObject({ rows: 1 });
      await expect(inspectDeliverableFile(join(root, "data.json"), "json")).resolves.toMatchObject({ rows: 1 });
      await expect(inspectDeliverableFile(join(root, "tiny.png"), "image")).resolves.toMatchObject({ format: "png" });
    });

    it("propagates a malformed deliverable as an inspection error", async () => {
      const root = workspace();
      writeFileSync(join(root, "broken.pdf"), "not a pdf");
      await expect(inspectDeliverableFile(join(root, "broken.pdf"), "pdf")).rejects.toThrow(/missing %PDF header/);
    });
  });
});
