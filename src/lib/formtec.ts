import { formtecHeaders, formtecImageHeader } from "./formtec-templates";

export const formtecPapers = {
  "3106": {
    name: "3106 · 사각 64 × 34 mm · 24개",
    count: 24,
    width: 64,
    height: 34,
    round: false,
  },
  "3639": {
    name: "3639 · 원형 38 mm · 20개",
    count: 20,
    width: 38,
    height: 38,
    round: true,
  },
} as const;
export type FormtecPaper = keyof typeof formtecPapers;

function decode(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

// Delphi Extended: explicit 64-bit significand followed by sign/exponent.
function setExtended(bytes: Uint8Array, offset: number, value: number) {
  bytes.fill(0, offset, offset + 10);
  if (!value) return;
  const exponent = Math.floor(Math.log2(value));
  const significand =
    BigInt(Math.round((value / 2 ** exponent) * 2 ** 52)) << 11n;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setBigUint64(offset, significand, true);
  view.setUint16(offset + 8, exponent + 16383, true);
}

export function formtecPlacement(
  paper: FormtecPaper,
  width: number,
  height: number,
  roundImage = false,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("올바른 스티커 이미지가 필요합니다.");
  const spec = formtecPapers[paper];
  // Inscribe the entire image in a round label so text at its corners survives cutting.
  const scale =
    spec.round && !roundImage
      ? spec.width / Math.hypot(width, height)
      : Math.min(spec.width / width, spec.height / height);
  return {
    x: (spec.width - width * scale) / 2,
    y: (spec.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

/** Build a single-page DGF with one embedded PNG object per occupied label. */
export function makeFormtecDesign(
  png: Uint8Array,
  paper: FormtecPaper,
  roundImage = false,
) {
  if (
    png.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => png[i] === v)
  )
    throw new Error("PNG 스티커 이미지가 필요합니다.");
  const dimensions = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const placement = formtecPlacement(
    paper,
    dimensions.getUint32(16),
    dimensions.getUint32(20),
    roundImage,
  );
  const object = decode(formtecImageHeader);
  // Two-byte stream version, two-byte object type, then x/y/width/height in mm.
  [placement.x, placement.y, placement.width, placement.height].forEach(
    (value, i) => setExtended(object, 4 + i * 10, value),
  );
  object.set(uint32(png.length), 83);
  const payload = concat([object, png]);
  const header = decode(formtecHeaders[paper]);
  const records = Array.from({ length: formtecPapers[paper].count }, (_, i) =>
    concat([uint32(i + 1), uint32(payload.length), payload]),
  );
  const page = concat([header, ...records]);
  // Design Pro's trailing page directory is a length-prefixed, space-padded ANSI string.
  // The page begins after the 65-byte file/version/page-count preamble.
  const directory = new Uint8Array(256).fill(32);
  directory.set(new TextEncoder().encode(`65,${page.length - 65}/`));
  return concat([page, uint32(directory.length), directory]);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DGZ is a ZIP container. Store one ASCII-named DGF, with no external image paths. */
export function makeFormtecFile(
  png: Uint8Array,
  paper: FormtecPaper,
  roundImage = false,
) {
  const data = makeFormtecDesign(png, paper, roundImage);
  const name = new TextEncoder().encode("Design/sticker.dgf");
  const local = new Uint8Array(30);
  const central = new Uint8Array(46);
  const end = new Uint8Array(22);
  const l = new DataView(local.buffer),
    c = new DataView(central.buffer),
    e = new DataView(end.buffer);
  const checksum = crc32(data);
  l.setUint32(0, 0x04034b50, true);
  l.setUint16(4, 20, true);
  l.setUint16(12, 33, true); // DOS date: 1980-01-01
  l.setUint32(14, checksum, true);
  l.setUint32(18, data.length, true);
  l.setUint32(22, data.length, true);
  l.setUint16(26, name.length, true);
  c.setUint32(0, 0x02014b50, true);
  c.setUint16(4, 20, true);
  c.setUint16(6, 20, true);
  c.setUint16(14, 33, true);
  c.setUint32(16, checksum, true);
  c.setUint32(20, data.length, true);
  c.setUint32(24, data.length, true);
  c.setUint16(28, name.length, true);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, 1, true);
  e.setUint16(10, 1, true);
  e.setUint32(12, central.length + name.length, true);
  e.setUint32(16, local.length + name.length + data.length, true);
  return concat([local, name, data, central, name, end]);
}
