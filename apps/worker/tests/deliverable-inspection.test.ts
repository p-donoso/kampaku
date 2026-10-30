import { deflateSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeCodingTool } from "../src/tools/file-tools.js";
import {
  INSPECTION_MALFORMED_CODE,
  INSPECTION_UNSUPPORTED_CODE,
  compareImages,
  inspectAudio,
  inspectDataset,
  inspectDocx,
  inspectImage,
  inspectImageText,
  inspectImageVisual,
  inspectPdf,
  inspectVideo,
  queryDataset,
  querySql,
} from "../src/tools/deliverable-inspection.js";

/* ----------------------------- fixtures ----------------------------- */

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

function buildPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number],
): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + stride)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const offset = y * (1 + stride) + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
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

function buildPdf(text: string): Buffer {
  const stream = deflateSync(Buffer.from(`BT /F1 12 Tf (${text}) Tj ET`, "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n", "latin1"),
    Buffer.from(`1 0 obj<</Length ${stream.length}>>stream\n`, "latin1"),
    stream,
    Buffer.from("\nendstream\nendobj\n/Type /Page\n%%EOF", "latin1"),
  ]);
}

function buildWav(seconds: number, sampleRate = 8_000): Buffer {
  const frames = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    data.writeInt16LE(Math.round(Math.sin(index / 10) * 8_000), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function buildMp4(durationUnits: number, timescale: number): Buffer {
  const mvhdBody = Buffer.alloc(100);
  mvhdBody[0] = 0;
  mvhdBody.writeUInt32BE(timescale, 12);
  mvhdBody.writeUInt32BE(durationUnits, 16);
  const mvhd = Buffer.concat([
    Buffer.from([0, 0, 0, 8 + mvhdBody.length]),
    Buffer.from("mvhd", "ascii"),
    mvhdBody,
  ]);

  const tkhd = Buffer.alloc(92);
  Buffer.from([0, 0, 0, 8 + tkhd.length]).copy(tkhd, 0);
  Buffer.from("tkhd", "ascii").copy(tkhd, 4);
  tkhd.writeUInt32BE(640 * 65_536, tkhd.length - 8);
  tkhd.writeUInt32BE(360 * 65_536, tkhd.length - 4);

  const trakBody = Buffer.concat([tkhd]);
  const trak = Buffer.concat([
    Buffer.from([0, 0, 0, 8 + trakBody.length]),
    Buffer.from("trak", "ascii"),
    trakBody,
  ]);
  const moovBody = Buffer.concat([mvhd, trak]);
  return Buffer.concat([
    Buffer.from([0, 0, 0, 16]),
    Buffer.from("ftyp", "ascii"),
    Buffer.from("isom", "ascii"),
    Buffer.from("mp42", "ascii"),
    Buffer.from([0, 0, 0, 8 + moovBody.length]),
    Buffer.from("moov", "ascii"),
    moovBody,
  ]);
}

function buildDocx(): Buffer {
  const documentXml =
    '<?xml version="1.0"?><w:document xmlns:w="w"><w:body>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Benchmark report</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>Latency improved by 12 percent.</w:t></w:r></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    + "</w:body></w:document>";

  const files: Array<{ name: string; data: Buffer }> = [
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ];
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateSync(file.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

/* ------------------------------- tests ------------------------------- */

describe("deliverable inspection capabilities", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  });

  function workspace(): string {
    directory = mkdtempSync(join(tmpdir(), "kampaku-deliverable-"));
    return directory;
  }

  describe("documents", () => {
    it("extracts text and structure from a PDF", () => {
      const inspection = inspectPdf(buildPdf("Latency improved by twelve percent"));
      expect(inspection.format).toBe("pdf");
      expect(inspection.pages).toBe(1);
      expect(inspection.text).toContain("Latency improved by twelve percent");
      expect(inspection.truncated).toBe(false);
    });

    it("rejects a malformed PDF instead of reporting empty content", () => {
      expect(() => inspectPdf(Buffer.from("not a pdf at all"))).toThrow(/missing %PDF header/);
    });

    it("extracts text, headings, and tables from a DOCX", () => {
      const inspection = inspectDocx(buildDocx());
      expect(inspection.format).toBe("docx");
      expect(inspection.headings).toBe(1);
      expect(inspection.tables).toBe(1);
      expect(inspection.words).toBeGreaterThan(4);
      expect(inspection.text).toContain("Benchmark report");
    });

    it("rejects a ZIP without document.xml", () => {
      const empty = Buffer.concat([
        zipChunk("PK\x03\x04", Buffer.alloc(0)),
        zipChunk("IHDR", Buffer.alloc(0)),
      ]);
      expect(() => inspectDocx(empty)).toThrow();
    });

    it("reports a renderer capability as unsupported instead of guessing", () => {
      try {
        inspectImageText();
        throw new Error("OCR should not succeed");
      } catch (error) {
        expect((error as { code?: string }).code).toBe(INSPECTION_UNSUPPORTED_CODE);
      }
    });
  });

  describe("images", () => {
    it("flags a blank render and accepts a rendered one", () => {
      const blank = inspectImageVisual(buildPng(8, 8, () => [255, 255, 255]));
      const inked = inspectImageVisual(buildPng(8, 8, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255])));
      expect(blank.blank).toBe(true);
      expect(inked.blank).toBe(false);
      expect(inked.inkRatio).toBeCloseTo(0.5, 2);
    });

    it("compares renders and detects an identical pair", () => {
      const blank = buildPng(8, 8, () => [255, 255, 255]);
      const inked = buildPng(8, 8, (x) => (x < 4 ? [0, 0, 0] : [255, 255, 255]));
      expect(compareImages(blank, blank).identical).toBe(true);
      const diff = compareImages(blank, inked);
      expect(diff.identical).toBe(false);
      expect(diff.changedRatio).toBeCloseTo(0.5, 2);
      expect(diff.maxChannelDelta).toBe(255);
    });

    it("rejects a size mismatch instead of scaling", () => {
      const small = buildPng(4, 4, () => [255, 255, 255]);
      const large = buildPng(8, 8, () => [255, 255, 255]);
      expect(() => compareImages(small, large)).toThrow(/differ/);
    });

    it("reads dimensions from a PNG header", () => {
      expect(inspectImage(buildPng(12, 5, () => [10, 20, 30]))).toMatchObject({
        format: "png",
        width: 12,
        height: 5,
      });
    });

    it("reports a malformed payload with a stable code", () => {
      try {
        inspectImageVisual(Buffer.from([1, 2, 3]));
        throw new Error("should not succeed");
      } catch (error) {
        expect((error as { code?: string }).code).toBe(INSPECTION_MALFORMED_CODE);
      }
    });
  });

  describe("audio and video", () => {
    it("reports WAV duration and signal statistics", () => {
      const inspection = inspectAudio(buildWav(1));
      expect(inspection).toMatchObject({ format: "wav", channels: 1, sampleRate: 8_000, codec: "pcm_s16le" });
      expect(inspection.durationSeconds).toBeCloseTo(1, 2);
      expect(inspection.peak).toBeGreaterThan(0.2);
      expect(inspection.speechAnalysis).toBe("unsupported");
    });

    it("rejects a truncated WAV", () => {
      expect(() => inspectAudio(Buffer.from("RIFFxxxxWAVE"))).toThrow();
    });

    it("reports MP4 duration and dimensions", () => {
      const inspection = inspectVideo(buildMp4(2_000, 1_000));
      expect(inspection.format).toBe("mp4");
      expect(inspection.durationSeconds).toBeCloseTo(2, 3);
      expect(inspection.width).toBe(640);
      expect(inspection.height).toBe(360);
      expect(inspection.frameExtraction).toBe("unsupported");
    });

    it("reports a container without moov as malformed", () => {
      const ftypOnly = Buffer.concat([
        Buffer.from([0, 0, 0, 16]),
        Buffer.from("ftyp", "ascii"),
        Buffer.from("isom", "ascii"),
        Buffer.from("mp42", "ascii"),
      ]);
      expect(() => inspectVideo(ftypOnly)).toThrow(/moov/);
    });
  });

  describe("datasets", () => {
    const csv = "id,name,score\n1,alpha,10\n2,beta,-3\n2,beta,-3\n";

    it("infers a schema, counts nulls and duplicates, and reports violations", () => {
      const inspection = inspectDataset("csv", csv, { unique: ["id"], nonNegative: ["score"] });
      expect(inspection.rows).toBe(3);
      expect(inspection.columns).toEqual(["id", "name", "score"]);
      expect(inspection.schema.score).toBe("number");
      expect(inspection.duplicateRows).toBe(1);
      expect(inspection.invariantViolations).toEqual(
        expect.arrayContaining(["duplicate id: 2", "negative score: -3"]),
      );
    });

    it("counts nulls for JSON datasets", () => {
      const inspection = inspectDataset(
        "json",
        JSON.stringify([{ id: 1, note: null }, { id: 2, note: "ok" }]),
      );
      expect(inspection.nullCounts.note).toBe(1);
    });

    it("filters rows by numeric bounds", () => {
      const result = queryDataset("csv", csv, { column: "score", min: 0 });
      expect(result.matches).toBe(1);
      expect(result.rows[0]?.name).toBe("alpha");
    });

    it("rejects an invalid JSON dataset", () => {
      expect(() => inspectDataset("json", "{not json")).toThrow(/valid JSON/);
    });

    it("reports SQL as unsupported instead of pretending to query", () => {
      try {
        querySql();
        throw new Error("SQL should not succeed");
      } catch (error) {
        expect((error as { code?: string }).code).toBe(INSPECTION_UNSUPPORTED_CODE);
      }
    });
  });

  describe("worker tool wiring", () => {
    it("inspects a document, an image, and a dataset through executeCodingTool", async () => {
      const root = workspace();
      writeFileSync(join(root, "report.pdf"), buildPdf("Delivery verified on disk"));
      writeFileSync(join(root, "chart.png"), buildPng(6, 6, () => [255, 255, 255]));
      writeFileSync(join(root, "data.csv"), "id,score\n1,4\n1,-2\n");

      const document = JSON.parse(
        await executeCodingTool("inspect_document", { path: "report.pdf" }, root),
      ) as { text: string };
      expect(document.text).toContain("Delivery verified on disk");

      const image = JSON.parse(
        await executeCodingTool("inspect_image", { path: "chart.png" }, root),
      ) as { blank: boolean };
      expect(image.blank).toBe(true);

      const dataset = JSON.parse(
        await executeCodingTool(
          "inspect_dataset",
          { path: "data.csv", format: "csv", unique: ["id"], non_negative: ["score"] },
          root,
        ),
      ) as { ok: boolean; invariantViolations: string[] };
      expect(dataset.ok).toBe(false);
      expect(dataset.invariantViolations.length).toBeGreaterThan(0);
    });

    it("denies document inspection outside the sandbox", async () => {
      const root = workspace();
      await expect(
        executeCodingTool("inspect_document", { path: "../outside.pdf" }, root),
      ).rejects.toThrow(/boundary is this job's own checkout/);
    });

    it("refuses an unsupported document format with a clear message", async () => {
      const root = workspace();
      writeFileSync(join(root, "notes.txt"), "plain text");
      await expect(
        executeCodingTool("inspect_document", { path: "notes.txt" }, root),
      ).rejects.toThrow(/supports pdf and docx/);
    });

    it("rejects a malformed argument set without crashing the loop", async () => {
      const root = workspace();
      await expect(executeCodingTool("inspect_image", {}, root)).rejects.toThrow(
        /Required string argument/,
      );
    });
  });
});
