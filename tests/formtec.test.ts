import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  formtecPapers,
  formtecPlacement,
  makeFormtecFile,
  type FormtecPaper,
} from "../src/lib/formtec";
import { formtecHeaders } from "../src/lib/formtec-templates";

// Independent reader for the stored ZIP entry; no customer reference files needed in CI.
function unzip(bytes: Buffer) {
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  const start = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  const compressed = bytes.subarray(start, start + bytes.readUInt32LE(18));
  expect(bytes.readUInt16LE(8)).toBe(0);
  const data = compressed;
  expect(data.length).toBe(bytes.readUInt32LE(22));
  return data;
}
function extended(bytes: Buffer, offset: number) {
  return (
    Number(bytes.readBigUInt64LE(offset)) *
    2 ** (bytes.readUInt16LE(offset + 8) - 16383 - 63)
  );
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
  "base64",
);

describe("Formtec DGZ export", () => {
  it("exports a round PNG at the full label diameter without shrinking it again", () => {
    const data = unzip(Buffer.from(makeFormtecFile(png, "3639", true)));
    const offset = Buffer.from(formtecHeaders["3639"], "base64").length + 8;
    expect(extended(data, offset + 4)).toBe(0);
    expect(extended(data, offset + 14)).toBe(0);
    expect(extended(data, offset + 24)).toBe(38);
    expect(extended(data, offset + 34)).toBe(38);
  });
  for (const paper of Object.keys(formtecPapers) as FormtecPaper[]) {
    it(`keeps the original ${paper} paper settings and embeds an identical PNG in every label`, () => {
      const header = Buffer.from(formtecHeaders[paper], "base64");
      // Golden hashes taken directly from the supplied DGZ paper headers.
      expect(createHash("sha256").update(header).digest("hex")).toBe(
        paper === "3106"
          ? "9199641418cdf1950edb24e32e6d7f456965d486a2bac1e4f326a0dfae78bc8e"
          : "f685d5a97c422ed8f701c3e61872092b7a09c4efcef548ba6d73e9fb9e25955e",
      );
      const paperStart = paper === "3106" ? 127 : 135;
      expect(extended(header, paperStart)).toBe(210);
      expect(extended(header, paperStart + 10)).toBe(297);
      expect(header.readUInt32LE(paperStart + 48)).toBe(
        paper === "3106" ? 3 : 4,
      );
      expect(header.readUInt32LE(paperStart + 52)).toBe(
        paper === "3106" ? 8 : 5,
      );
      const zip = Buffer.from(makeFormtecFile(png, paper));
      const data = unzip(zip);
      expect(data.subarray(0, header.length)).toEqual(header);
      let offset = header.length;
      for (let i = 1; i <= formtecPapers[paper].count; i++) {
        expect(data.readUInt32LE(offset)).toBe(i);
        const length = data.readUInt32LE(offset + 4);
        const object = data.subarray(offset + 8, offset + 8 + length);
        expect(object.readUInt16LE(0)).toBe(440); // Design Pro stream version
        expect(object.readUInt16LE(2)).toBe(9); // Image, with no original text objects
        expect(object.readUInt32LE(83)).toBe(png.length);
        expect(object.subarray(87)).toEqual(png);
        const placement = formtecPlacement(paper, 1, 1);
        [placement.x, placement.y, placement.width, placement.height].forEach(
          (value, j) =>
            expect(extended(object, 4 + j * 10)).toBeCloseTo(value, 10),
        );
        offset += length + 8;
      }
      expect(data.readUInt32LE(offset)).toBe(256);
      expect(
        data
          .subarray(offset + 4)
          .toString()
          .trim(),
      ).toBe(`65,${offset - 65}/`);
      expect(data.length).toBe(offset + 260);
      // Central ZIP directory points to this one entry and to the correct byte ranges.
      const end = zip.length - 22;
      expect(zip.readUInt32LE(end)).toBe(0x06054b50);
      expect(zip.readUInt16LE(end + 10)).toBe(1);
      const central = zip.readUInt32LE(end + 16);
      expect(zip.readUInt32LE(central)).toBe(0x02014b50);
      expect(zip.readUInt32LE(central + 16)).toBe(zip.readUInt32LE(14));
      expect(central + zip.readUInt32LE(end + 12)).toBe(end);
    });
  }
  it("preserves the image ratio and keeps all corners inside the selected label", () => {
    for (const paper of Object.keys(formtecPapers) as FormtecPaper[]) {
      for (const [width, height] of [
        [900, 500],
        [900, 900],
        [10, 2000],
      ]) {
        const p = formtecPlacement(paper, width, height),
          spec = formtecPapers[paper];
        expect(p.width / p.height).toBeCloseTo(width / height);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width).toBeLessThanOrEqual(spec.width);
        expect(p.y + p.height).toBeLessThanOrEqual(spec.height);
        if (spec.round) expect(Math.hypot(p.width, p.height)).toBeCloseTo(38);
      }
    }
  });
  it("rejects missing PNGs and invalid dimensions", () => {
    expect(() => makeFormtecFile(new Uint8Array(), "3106")).toThrow();
    for (const size of [0, -1, NaN, Infinity])
      expect(() => formtecPlacement("3639", size, 900)).toThrow();
  });
});
