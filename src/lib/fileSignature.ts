// Memeriksa "magic bytes" (tanda tangan isi berkas) agar berkas berlabel gambar/PDF/ZIP benar-benar
// berisi tipe tersebut. MIME dari klien mudah dipalsukan; isi berkas tidak.

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const ascii = (buffer: Buffer, start: number, end: number): string => buffer.subarray(start, end).toString("ascii");

const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b: Buffer) => b.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(b, 0, 6));
const isWebp = (b: Buffer) => b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
const isPdf = (b: Buffer) => b.length >= 5 && ascii(b, 0, 5) === "%PDF-";
const isZip = (b: Buffer) =>
  startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08]);

const CHECKS: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": isJpeg,
  "image/jpg": isJpeg,
  "image/png": isPng,
  "image/gif": isGif,
  "image/webp": isWebp,
  "application/pdf": isPdf,
  "application/zip": isZip,
  "application/x-zip-compressed": isZip,
};

/** true bila isi `buffer` cocok dengan tipe yang diklaim; false bila tidak cocok atau tipe tidak dikenal. */
export function hasValidSignature(buffer: Buffer, mimetype: string): boolean {
  const check = CHECKS[mimetype];
  return check ? check(buffer) : false;
}

export default { hasValidSignature };
