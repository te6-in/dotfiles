const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Decodes the first `count` bytes of a base64 string (the environment has no atob). */
export function decodeBase64Head(base64: string, count: number) {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of base64) {
    if (bytes.length >= count) break;
    const value = BASE64.indexOf(char);
    if (value < 0) continue;

    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return bytes;
}

/** Width and height from a PNG's IHDR chunk, or undefined when the bytes are no PNG. */
export function pngSize(base64: string): { width: number; height: number } | undefined {
  const head = decodeBase64Head(base64, 24);
  if (head.length < 24 || PNG_SIGNATURE.some((byte, index) => head[index] !== byte)) return undefined;

  const word = (at: number) =>
    ((head[at] ?? 0) * 0x1000000) + (((head[at + 1] ?? 0) << 16) | ((head[at + 2] ?? 0) << 8) | (head[at + 3] ?? 0));
  return { width: word(16), height: word(20) };
}

/**
 * Cells for a picture: no wider than its own pixels at ~8 px a cell, inside the
 * box, terminal cells being about twice as tall as wide.
 */
export function fitCells(
  size: { width: number; height: number },
  box: { columns: number; rows: number },
): { columns: number; rows: number } {
  const maxColumns = Math.max(1, Math.min(255, box.columns));
  const maxRows = Math.max(1, Math.min(255, box.rows));
  const aspect = size.height / Math.max(1, size.width);

  const columns = Math.max(1, Math.min(maxColumns, Math.ceil(size.width / 8)));
  const rows = Math.max(1, Math.round((columns * aspect) / 2));
  if (rows <= maxRows) return { columns, rows };

  return { columns: Math.max(1, Math.min(maxColumns, Math.round((maxRows * 2) / aspect))), rows: maxRows };
}
