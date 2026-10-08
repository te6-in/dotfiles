import type { FsBytes, FsEntry, FsStat, ImageSource, ProcessRunResult } from 'claude-code';
import type { ImageEntry } from '../types';
import { pngSize } from './png-size';

export const MAX_IMAGES = 6;
export const HISTORY_LIMIT = 30;
const MAX_INLINE_PNG = 2 * 1024 * 1024;
const MAX_READ = 4 * 1024 * 1024;
/** Long edges tried in turn until the PNG fits inline. */
const EDGES = [1600, 1100, 800];
const CACHE_ROOT = 'claude-images';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Base64 characters held in memory across redraws; past it the oldest are read from disk again. */
const MEMORY_BUDGET = 48 * 1024 * 1024;

/**
 * A drawable PNG: `file` always names one on disk (the original, or the
 * session's converted copy), `base64` its bytes when they fit inline.
 */
export type LoadedImage =
  | { width: number; height: number; file: string; base64?: string; error?: never }
  | { error: string; detail?: string };

/** What loading needs from `$`, handed in as closures since a module never passes `$` itself. */
export type ImageIo = {
  exists: (path: string) => Promise<boolean>;
  stat: (path: string) => Promise<FsStat>;
  bytes: (path: string) => Promise<string | FsBytes>;
  list: (path: string) => Promise<FsEntry[]>;
  run: (argv: readonly string[]) => Promise<ProcessRunResult>;
  tmpDir: () => Promise<string>;
  sessionId: () => Promise<string>;
};

/** Loaded images by source path, size and mtime: a changed file is a new key. */
const memory = new Map<string, LoadedImage>();
let memoryChars = 0;
let cacheDirMade: string | undefined;

export const describeFailure = (path: string, failed: { error: string; detail?: string }) =>
  `${path}: ${failed.error}${failed.detail === undefined ? '' : ` (${failed.detail})`}`;

/** FNV-1a, so a source's converted copy keeps one name across reloads. */
function hashKey(key: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const sourceKey = (path: string, stat: FsStat) => `${path}|${stat.size}|${Math.floor(stat.mtimeMs)}`;

function remember(key: string, loaded: LoadedImage) {
  memory.set(key, loaded);
  memoryChars += loaded.error === undefined ? (loaded.base64?.length ?? 0) : 0;
  for (const [oldKey, old] of memory) {
    if (memoryChars <= MEMORY_BUDGET) break;
    memory.delete(oldKey);
    memoryChars -= old.error === undefined ? (old.base64?.length ?? 0) : 0;
  }
  return loaded;
}

/** This session's folder of converted copies; the first call also removes other sessions' folders a day old. */
async function cacheDir(io: ImageIo) {
  if (cacheDirMade !== undefined) return cacheDirMade;

  const root = `${(await io.tmpDir()).replace(/\/$/, '')}/${CACHE_ROOT}`;
  const session = (await io.sessionId()).replace(/[^A-Za-z0-9_-]/g, '_');
  const dir = `${root}/${session}`;
  const made = await io.run(['mkdir', '-p', dir]);
  if (made.exitCode !== 0) throw new Error(`mkdir ${dir}: ${made.stderr.trim()}`);

  const stale = (await io.list(root))
    .filter((entry) => entry.name !== session && Date.now() - entry.mtimeMs > CACHE_MAX_AGE_MS)
    .map((entry) => `${root}/${entry.name}`);
  if (stale.length > 0) await io.run(['rm', '-rf', '--', ...stale]);
  cacheDirMade = dir;
  return dir;
}

const convertedPath = async (key: string, io: ImageIo) => `${await cacheDir(io)}/img-${hashKey(key)}.png`;

/** `pixelWidth: 4032` and `pixelHeight: 3024` from `sips -g`; undefined when sips cannot read the file. */
async function probe(path: string, io: ImageIo) {
  const probed = await io.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  const width = Number(/pixelWidth:\s*(\d+)/.exec(probed.stdout)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(probed.stdout)?.[1]);
  if (probed.exitCode !== 0 || !(width > 0) || !(height > 0)) return undefined;

  return { width, height };
}

async function readPng(file: string, io: ImageIo): Promise<Extract<LoadedImage, { file: string }> | undefined> {
  const stat = await io.stat(file);
  const bytes = await io.bytes(file);
  const png = typeof bytes === 'string' ? undefined : pngSize(bytes.base64);
  if (typeof bytes === 'string' || png === undefined) return undefined;

  return { ...png, file, ...(stat.size <= MAX_INLINE_PNG && { base64: bytes.base64 }) };
}

/** Converts any image sips reads into a PNG small enough to send inline, under a name the source's key fixes. */
async function convert(path: string, out: string, io: ImageIo): Promise<LoadedImage> {
  const size = await probe(path, io);
  if (size === undefined) return { error: 'sips cannot read it as an image' };

  const longEdge = Math.max(size.width, size.height);
  for (const edge of EDGES) {
    const scale = longEdge > edge ? ['-Z', String(edge)] : [];
    const converted = await io.run(['sips', '-s', 'format', 'png', ...scale, path, '--out', out]);
    if (converted.exitCode !== 0) return { error: `sips failed: ${converted.stderr.trim() || `exit ${converted.exitCode}`}` };
    if ((await io.stat(out)).size > MAX_INLINE_PNG && longEdge > edge) continue;

    return (await readPng(out, io)) ?? { error: 'sips wrote no PNG' };
  }
  return (await readPng(out, io)) ?? { error: 'sips wrote no PNG' };
}

/**
 * One image ready to draw. A small PNG is read as is; anything else is
 * converted once into the session's folder, and later loads (a redraw, a
 * reload) read that copy back instead of running sips again.
 */
export async function loadImage(path: string, io: ImageIo): Promise<LoadedImage> {
  let stat: FsStat;
  try {
    stat = await io.stat(path);
  } catch (error) {
    return (await io.exists(path).catch(() => false)) ? { error: 'unreadable', detail: String(error) } : { error: 'no such file' };
  }
  if (stat.kind !== 'file') return { error: 'not a file' };

  const key = sourceKey(path, stat);
  const known = memory.get(key);
  if (known !== undefined) return known;

  try {
    const original = stat.size <= MAX_INLINE_PNG ? await readPng(path, io) : undefined;
    if (original !== undefined && Math.max(original.width, original.height) <= (EDGES[0] ?? Infinity)) {
      return remember(key, original);
    }

    const out = await convertedPath(key, io).catch(() => undefined);
    if (out !== undefined && (await io.exists(out))) {
      const cached = await readPng(out, io);
      if (cached !== undefined) return remember(key, cached);
    }

    const converted =
      out === undefined ? { error: 'no folder for converted copies' } : await convert(path, out, io).catch((error: unknown) => ({ error: String(error) }));
    if (converted.error === undefined) return remember(key, converted);

    // A PNG that would not shrink still draws by path where the terminal reads this machine's files.
    const png = stat.size <= MAX_READ ? (original ?? (await readPng(path, io))) : undefined;
    if (png !== undefined) return remember(key, { width: png.width, height: png.height, file: path });

    return {
      error: /\.png$/i.test(path) ? 'too large, could not shrink' : 'unsupported format',
      detail: converted.detail ?? converted.error,
    };
  } catch (error) {
    return { error: 'unreadable', detail: String(error) };
  }
}

/** Removes the converted copies of sources no entry still names. */
export async function forgetDropped(dropped: readonly ImageEntry[], kept: readonly ImageEntry[], io: ImageIo) {
  const stillShown = new Set(kept.flatMap((entry) => entry.paths));
  const gone = [...new Set(dropped.flatMap((entry) => entry.paths))].filter((path) => !stillShown.has(path));
  if (gone.length === 0) return;

  const dir = await cacheDir(io);
  const files: string[] = [];
  for (const path of gone) {
    const stat = await io.stat(path).catch(() => undefined);
    if (stat === undefined) continue;

    const key = sourceKey(path, stat);
    const known = memory.get(key);
    if (known !== undefined) {
      memory.delete(key);
      memoryChars -= known.error === undefined ? (known.base64?.length ?? 0) : 0;
    }
    files.push(`${dir}/img-${hashKey(key)}.png`);
  }
  if (files.length > 0) await io.run(['rm', '-f', '--', ...files]);
}

/** The history with `entry` first and at most `HISTORY_LIMIT` kept, and what fell off the end. */
export function withEntry(history: readonly ImageEntry[], entry: ImageEntry) {
  const next = [entry, ...history];
  return { kept: next.slice(0, HISTORY_LIMIT), dropped: next.slice(HISTORY_LIMIT) };
}

/** The source to draw: inline bytes while the drawing's budget lasts, the file's path past it. */
export function sourceOf(image: { file: string; base64?: string }, budget: { chars: number }): ImageSource {
  if (image.base64 === undefined || image.base64.length > budget.chars) return { file: image.file, format: 'png' };

  budget.chars -= image.base64.length;
  return { png: image.base64 };
}

export const INLINE_BUDGET_CHARS = 24 * 1024 * 1024;
