import { atom, read, update } from 'claude-code';
import type { Register } from 'claude-code';
import type { ImageEntry } from '../types';
import {
  INLINE_BUDGET_CHARS,
  MAX_IMAGES,
  describeFailure,
  forgetDropped,
  loadImage,
  sourceOf,
  withEntry,
} from './image-loading';
import type { ImageIo, LoadedImage } from './image-loading';
import { fitCells } from './png-size';
import { displayOf, resolveImagePath } from './terminal-images';

const IMG_PANE = 'img';
const IMG_TITLE = 'Images';
/** Per image in the history: fit to the pane's width, at most this many rows. */
const IMAGE_ROWS = 16;
const SHOW_IMAGE = 'show_image';
const SHOW_IMAGE_TOOL = 'mcp__images__show_image';

const history = atom({ plugin: 'images', key: 'history' } as const, []);

let cwd = '';

const NO_DISPLAY = "Images can't be drawn in this terminal.";

/** Why a path can't be handed to `showimg`, or undefined when it names a file. */
async function fileProblem(path: string, fs: { exists: (path: string) => Promise<boolean>; isFile: (path: string) => Promise<boolean> }) {
  if (!(await fs.exists(path))) return 'no such file';

  return (await fs.isFile(path)) ? undefined : 'not a file';
}

/** `showimg` splits an Orca pane and returns at once; its own conversion covers every format. */
async function showInOrca(paths: readonly string[], run: (argv: readonly string[]) => Promise<{ exitCode: number; stderr: string }>) {
  try {
    const shown = await run(['showimg', ...paths]);
    if (shown.exitCode === 0) return undefined;

    return shown.stderr.trim().split('\n')[0]?.trim() || `showimg exited ${shown.exitCode}`;
  } catch (error) {
    return String(error).split('\n')[0] ?? 'showimg failed';
  }
}

const clock = (at: number) => {
  const time = new Date(at);
  return [time.getHours(), time.getMinutes(), time.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
};

/** Loads every path, one at a time (they may share sips and the cache folder). */
async function loadAll(paths: readonly string[], io: ImageIo) {
  const loaded: { path: string; loaded: LoadedImage }[] = [];
  for (const path of paths) loaded.push({ path, loaded: await loadImage(path, io) });
  return loaded;
}

/** Puts a showing first in the history and drops the converted copies of what fell off the end. */
async function record(
  entry: ImageEntry,
  store: (change: (list: ImageEntry[]) => ImageEntry[]) => Promise<unknown>,
  io: ImageIo,
) {
  let trimmed = withEntry([], entry);
  await store((list) => {
    trimmed = withEntry(list, entry);
    return trimmed.kept;
  });
  await forgetDropped(trimmed.dropped, trimmed.kept, io).catch(() => undefined);
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    cwd = e.cwd;
    try {
      await $.command.register({ name: 'img', description: 'Show an image, or the session\'s images, in a pane', argumentHint: '[path]', immediate: true });
      await $.tool.register({
        name: SHOW_IMAGE,
        description: 'Show image files to the user.',
        inputSchema: {
          type: 'object',
          properties: {
            paths: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: MAX_IMAGES,
              description: 'Image paths',
            },
            caption: { type: 'string', description: 'Short caption' },
          },
          required: ['paths'],
          additionalProperties: false,
        },
        isDeferred: false,
      });
    } catch (error) {
      $.ui.log(`images: setup failed: ${String(error)}`, { to: 'debug' });
    }
    return next(e);
  });

  on('command.run', { command: 'img' }, async ($, e) => {
    const display = displayOf({
      termProgram: await $.env.get('TERM_PROGRAM'),
      term: await $.env.get('TERM'),
      tmux: await $.env.get('TMUX'),
      sty: await $.env.get('STY'),
      orcaPaneKey: await $.env.get('ORCA_PANE_KEY'),
    });
    if (display === 'none') return { text: NO_DISPLAY };
    if (display === 'orca') {
      const io: ImageIo = {
        exists: (target) => $.fs.exists(target),
        stat: (target) => $.fs.stat(target),
        bytes: (target) => $.fs.read(target, { as: 'bytes' }),
        list: (target) => $.fs.list(target),
        run: (argv) => $.process.run(argv),
        tmpDir: async () => (await $.env.get('TMPDIR')) ?? '/tmp',
        sessionId: () => $.session.id(),
      };
      if (e.args.trim() === '') {
        const [newest] = await read($, history);
        if (newest === undefined) return { text: 'No images yet.' };

        const failure = await showInOrca(newest.paths, (argv) => $.process.run(argv));
        return failure === undefined ? {} : { text: `img: ${failure}` };
      }

      const path = await resolveImagePath(e.args, {
        home: async () => (await $.env.get('HOME')) ?? '',
        cwd: async () => (cwd !== '' ? cwd : $.session.cwd()),
      });
      const problem = await fileProblem(path, {
        exists: (target) => $.fs.exists(target),
        isFile: async (target) => (await $.fs.stat(target)).kind === 'file',
      });
      if (problem !== undefined) return { text: `img: ${path}: ${problem}` };

      const failure = await showInOrca([path], (argv) => $.process.run(argv));
      if (failure !== undefined) return { text: `img: ${failure}` };

      await record({ paths: [path], at: Date.now() }, (change) => update($, history, change), io);
      return {};
    }

    if (e.args.trim() !== '') {
      const io: ImageIo = {
      exists: (target) => $.fs.exists(target),
      stat: (target) => $.fs.stat(target),
      bytes: (target) => $.fs.read(target, { as: 'bytes' }),
      list: (target) => $.fs.list(target),
      run: (argv) => $.process.run(argv),
      tmpDir: async () => (await $.env.get('TMPDIR')) ?? '/tmp',
      sessionId: () => $.session.id(),
    };
      const path = await resolveImagePath(e.args, {
        home: async () => (await $.env.get('HOME')) ?? '',
        cwd: async () => (cwd !== '' ? cwd : $.session.cwd()),
      });
      const loaded = await loadImage(path, io);
      if (loaded.error !== undefined) return { text: `img: ${describeFailure(path, loaded)}` };

      await record({ paths: [path], at: Date.now() }, (change) => update($, history, change), io);
    }

    const opened = await $.ui.open({ id: IMG_PANE, title: IMG_TITLE, focus: true, closeOnEscape: true, rows: 24 });
    if (!opened.isPlaced) return { text: `img pane is waiting: ${opened.reason}` };

    await $.ui.scroll({ in: IMG_PANE, to: 'start' }).catch(() => undefined);
    return {};
  }).catch(() => ({ text: 'img: could not open the pane (see claude --debug)' }));
  on('tool.call', { tool: SHOW_IMAGE_TOOL }, async ($, e) => {
    const rawPaths = Array.isArray(e.paths) ? e.paths : typeof e.path === 'string' ? [e.path] : [];
    const given = rawPaths.filter((one): one is string => typeof one === 'string' && one.trim() !== '');
    if (given.length === 0) return { result: 'error: no paths' };
    if (given.length > MAX_IMAGES) return { result: `error: at most ${MAX_IMAGES} paths` };

    const where = {
      home: async () => (await $.env.get('HOME')) ?? '',
      cwd: async () => (cwd !== '' ? cwd : $.session.cwd()),
    };
    const io: ImageIo = {
      exists: (target) => $.fs.exists(target),
      stat: (target) => $.fs.stat(target),
      bytes: (target) => $.fs.read(target, { as: 'bytes' }),
      list: (target) => $.fs.list(target),
      run: (argv) => $.process.run(argv),
      tmpDir: async () => (await $.env.get('TMPDIR')) ?? '/tmp',
      sessionId: () => $.session.id(),
    };
    const display = displayOf({
      termProgram: await $.env.get('TERM_PROGRAM'),
      term: await $.env.get('TERM'),
      tmux: await $.env.get('TMUX'),
      sty: await $.env.get('STY'),
      orcaPaneKey: await $.env.get('ORCA_PANE_KEY'),
    });
    if (display === 'none') return { result: 'error: no image display in this terminal' };

    const paths = await Promise.all(given.map((one) => resolveImagePath(one, where)));
    const caption = typeof e.caption === 'string' && e.caption.trim() !== '' ? e.caption.trim().slice(0, 200) : undefined;
    if (display === 'orca') {
      const problems: string[] = [];
      for (const path of paths) {
        const problem = await fileProblem(path, {
          exists: (target) => $.fs.exists(target),
          isFile: async (target) => (await $.fs.stat(target)).kind === 'file',
        });
        if (problem !== undefined) problems.push(`error: ${path}: ${problem}`);
      }
      if (problems.length > 0) return { result: problems.join('\n') };

      const failure = await showInOrca(paths, (argv) => $.process.run(argv));
      if (failure !== undefined) return { result: `error: ${failure}` };

      await record({ paths, at: Date.now(), ...(caption !== undefined && { caption }) }, (change) => update($, history, change), io);
      return { result: 'ok' };
    }

    const loaded = await loadAll(paths, io);
    const failed = loaded.flatMap(({ path, loaded: one }) => (one.error === undefined ? [] : [`error: ${path}: ${one.error}`]));
    if (failed.length > 0) return { result: failed.join('\n') };

    const entry = { paths, at: Date.now(), ...(caption !== undefined && { caption }) };
    await record(entry, (change) => update($, history, change), io);
    const opened = await $.ui.open({ id: IMG_PANE, title: IMG_TITLE, closeOnEscape: true, rows: 24 });
    if (opened.isPlaced) await $.ui.scroll({ in: IMG_PANE, to: 'start' }).catch(() => undefined);
    // The engine draws nothing for a waiting pane, so the person hears it here.
    else $.ui.toast('Image ready · /img');
    return { result: 'ok' };
  }).catch(() => ({ result: 'error: show_image failed' }));
  on('ui.render', { component: 'Pane', requestId: IMG_PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    try {
      const entries = await read($, history);
      if (!Array.isArray(entries) || entries.length === 0) return <Text dimColor>No images yet.</Text>;

      const io: ImageIo = {
        exists: (target) => $.fs.exists(target),
        stat: (target) => $.fs.stat(target),
        bytes: (target) => $.fs.read(target, { as: 'bytes' }),
        list: (target) => $.fs.list(target),
        run: (argv) => $.process.run(argv),
        tmpDir: async () => (await $.env.get('TMPDIR')) ?? '/tmp',
        sessionId: () => $.session.id(),
      };
      const shown = [];
      for (const entry of entries) shown.push({ entry, images: await loadAll(entry.paths, io) });

      const budget = { chars: INLINE_BUDGET_CHARS };
      const box = { columns: e.props.bodyColumns, rows: Math.max(1, Math.min(IMAGE_ROWS, e.props.scroll.bodyRows - 3)) };
      const terminal = e.surface === 'terminal' ? $.ui.resolve(e) : undefined;

      return (
        <Box flexDirection="column">
          {shown.map(({ entry, images }, entryIndex) => (
            <Box flexDirection="column" {...(entryIndex > 0 && { marginTop: 1 })}>
              {entry.caption !== undefined && <Text bold wrap="truncate-end">{entry.caption}</Text>}
              <Text dimColor>{clock(entry.at)}</Text>
              {images.map(({ path, loaded }, imageIndex) => {
                if (loaded.error !== undefined) return <Text color="error">{describeFailure(path, loaded)}</Text>;

                const cells = fitCells(loaded, box);
                const alt = `Image ${path} (${loaded.width}x${loaded.height}): this terminal shows text in place of pictures; kitty and Ghostty draw it`;
                if (terminal === undefined) return <Text dimColor>{alt}</Text>;

                const { Image } = terminal;
                return (
                  <Box flexDirection="column">
                    <Image
                      key={`img-${entryIndex}-${imageIndex}`}
                      source={sourceOf(loaded, budget)}
                      columns={cells.columns}
                      rows={cells.rows}
                      alt={alt}
                    />
                    <Text dimColor wrap="truncate-middle">
                      {`${path} · ${loaded.width}x${loaded.height}px`}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      );
    } catch (error) {
      return <Text color="error">{`img: ${String(error)}`}</Text>;
    }
  });
};
