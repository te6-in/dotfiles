import { expect, mock, test } from 'claude-code/testing';
import type { On, PaneOpenArgs } from 'claude-code';
import { fitCells, pngSize } from '../hooks/png-size';

const PANE = {
  plugin: 'images',
  component: 'Pane',
  requestId: 'img',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'Images',
    isFocused: true,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

// A command typed at the prompt of a narrow, non-fullscreen terminal, like an Orca pane.
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const;

// 1x1 PNG
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('/img reports a file that is not a PNG', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'ghostty' });
  on('fs.exists', () => ({ value: true }));
  on('fs.stat', () => ({ value: { kind: 'file', size: 4, mtimeMs: 1, isLink: false } }));
  on('fs.read', () => ({ value: { base64: 'aGVsbG8=' } }));

  const answer = await $.command.run({ ...TYPED, command: 'img', args: '/tmp/notes.txt' });
  expect(answer.text).toMatch(/^img: \/tmp\/notes\.txt: unsupported format/);
});

test('image sizing', () => {
  expect(pngSize(PNG_1x1)).toEqual({ width: 1, height: 1 });
  expect(pngSize('aGVsbG8=')).toBeUndefined();
  expect(fitCells({ width: 400, height: 400 }, { columns: 100, rows: 40 })).toEqual({ columns: 50, rows: 25 });
  expect(fitCells({ width: 400, height: 400 }, { columns: 100, rows: 10 })).toEqual({ columns: 20, rows: 10 });
});

const TERMINALS = [
  { name: 'Ghostty', env: { TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty' } },
  { name: 'kitty', env: { TERM: 'xterm-kitty' } },
  { name: 'Orca', env: { TERM_PROGRAM: 'Orca', TERM: 'xterm-256color', ORCA_PANE_KEY: 'pane-1' } },
  { name: 'Ghostty under tmux', env: { TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-501/default,1,0' } },
  { name: 'a plain terminal', env: { TERM: 'xterm-256color' } },
] as const;

for (const terminal of TERMINALS) {
  test(`show_image is registered in ${terminal.name}`, async ($, on) => {
    const registered: string[] = [];
    mock.env(on, terminal.env);
    on('command.register', ($, e) => ({ value: { command: e.name } }));
    on('tool.register', ($, e) => {
      registered.push(e.name);
      return { value: { tool: `mcp__images__${e.name}` } };
    });
    on('session.start', () => ({ cwd: '/work' }));
    on('ui.log', () => ({ value: undefined }));

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
    expect(registered).toEqual(['show_image']);
  });
}

const ORCA_ENV = { TERM_PROGRAM: 'Orca', ORCA_PANE_KEY: 'pane-1', HOME: '/home/me' } as const;

/** Stubs Orca's side: files that exist (or not) and `showimg`'s exit. */
function stubOrca(on: On, showimg: { exitCode: number; stderr?: string }, missing: readonly string[] = []) {
  const runs: string[][] = [];
  const opened: PaneOpenArgs[] = [];
  mock.env(on, ORCA_ENV);
  on('fs.exists', ($, e) => ({ value: !missing.includes(e.path) }));
  on('fs.stat', () => ({ value: { kind: 'file', size: 70, mtimeMs: 1, isLink: false } }));
  on('process.run', ($, e) => {
    runs.push([...e.argv]);
    return {
      value: { exitCode: showimg.exitCode, stdout: '', stderr: showimg.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false },
    };
  });
  on('ui.open', ($, e) => {
    opened.push(e);
    return { value: { isPlaced: true } };
  });
  return { runs, opened };
}

test('in Orca show_image hands absolute paths to showimg and answers ok', async ($, on) => {
  const { runs, opened } = stubOrca(on, { exitCode: 0 });

  const out = await $.tool.call({ tool: 'mcp__images__show_image', tool_use_id: 't', paths: ['/x/photo.heic', '~/shot.png'] });
  expect(out.result).toBe('ok');
  expect(runs).toEqual([['showimg', '/x/photo.heic', '/home/me/shot.png']]);
  expect(opened).toEqual([]);
});

test('in Orca a failing showimg comes back as its first stderr line', async ($, on) => {
  stubOrca(on, { exitCode: 2, stderr: '  showimg: no Orca pane to split  \nmore detail\n' });

  const out = await $.tool.call({ tool: 'mcp__images__show_image', tool_use_id: 't', paths: ['/x/a.png'] });
  expect(out.result).toBe('error: showimg: no Orca pane to split');
});

test('in Orca a missing file is reported before showimg runs', async ($, on) => {
  const { runs } = stubOrca(on, { exitCode: 0 }, ['/x/gone.png']);

  const out = await $.tool.call({ tool: 'mcp__images__show_image', tool_use_id: 't', paths: ['/x/gone.png'] });
  expect(out.result).toBe('error: /x/gone.png: no such file');
  expect(runs).toEqual([]);
});

test('with no way to show images, show_image says so', async ($, on) => {
  mock.env(on, { TERM: 'xterm-256color' });

  const out = await $.tool.call({ tool: 'mcp__images__show_image', tool_use_id: 't', paths: ['/x/a.png'] });
  expect(out.result).toBe('error: no image display in this terminal');
  expect((await $.command.run({ ...TYPED, command: 'img', args: '' })).text).toBe("Images can't be drawn in this terminal.");
});

test('/img in Orca: bare with no history, then a path, then bare again re-shows the newest', async ($, on) => {
  const { runs } = stubOrca(on, { exitCode: 0 });

  expect(await $.command.run({ ...TYPED, command: 'img', args: '' })).toEqual({ text: 'No images yet.' });
  expect(await $.command.run({ ...TYPED, command: 'img', args: '/x/a.jpg' })).toEqual({});
  await $.tool.call({ tool: 'mcp__images__show_image', tool_use_id: 't', paths: ['/x/b.png', '/x/c.png'] });
  expect(await $.command.run({ ...TYPED, command: 'img', args: '' })).toEqual({});

  expect(runs).toEqual([
    ['showimg', '/x/a.jpg'],
    ['showimg', '/x/b.png', '/x/c.png'],
    ['showimg', '/x/b.png', '/x/c.png'],
  ]);
});

// A PNG header that says 4000x3000.
const PNG_4000x3000 = 'iVBORw0KGgoAAAANSUhEUgAAD6AAAAu4CAYAAAA=';

const OK_RUN = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false };

/**
 * Stubs what loading images reaches: sources by path, a cache folder under
 * $TMPDIR that holds what sips wrote, and the pane calls.
 */
function stubImages(
  on: On,
  options: {
    sources?: Readonly<Record<string, { size: number; base64: string }>>;
    sips?: { probe: string; exitCode: number; stderr?: string };
    isConvertedOnDisk?: boolean;
    isPlaced?: boolean;
  } = {},
) {
  const runs: string[][] = [];
  const opened: PaneOpenArgs[] = [];
  const toasts: string[] = [];
  const written = new Set<string>();
  const isCache = (path: string) => path.includes('/claude-images/');
  const sourceOf = (path: string) => options.sources?.[path] ?? { size: 70, base64: PNG_1x1 };

  mock.env(on, { TERM_PROGRAM: 'ghostty', TMPDIR: '/var/tmp-test/', HOME: '/home/me' });
  on('session.id', () => ({ value: 'sess-1' }));
  on('fs.exists', ($, e) => ({ value: isCache(e.path) ? options.isConvertedOnDisk === true || written.has(e.path) : true }));
  on('fs.list', () => ({
    value: [
      { name: 'old-session', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'sess-1', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }));
  on('fs.stat', ($, e) => ({ value: { kind: 'file', size: isCache(e.path) ? 900_000 : sourceOf(e.path).size, mtimeMs: 1, isLink: false } }));
  on('fs.read', ($, e) => ({ value: { base64: isCache(e.path) ? PNG_1x1 : sourceOf(e.path).base64 } }));
  on('process.run', ($, e) => {
    runs.push([...e.argv]);
    if (e.argv[0] !== 'sips' || options.sips === undefined) return { value: OK_RUN };
    if (e.argv[1] === '-g') return { value: { ...OK_RUN, stdout: options.sips.probe } };
    if (options.sips.exitCode === 0) written.add(e.argv[e.argv.length - 1] ?? '');
    return { value: { ...OK_RUN, exitCode: options.sips.exitCode, stderr: options.sips.stderr ?? '' } };
  });
  on('ui.open', ($, e) => {
    opened.push(e);
    return { value: options.isPlaced === false ? { isPlaced: false, reason: 'unasked panes need 144 columns' } : { isPlaced: true } };
  });
  on('ui.scroll', () => ({}));
  on('ui.toast', ($, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  const conversions = () => runs.filter((argv) => argv[0] === 'sips' && argv[1] === '-s');
  return { runs, opened, toasts, conversions };
}

const IMG_PANE_MOUNT = { ...PANE, surface: 'terminal' } as const;

const showImage = (paths: string[], caption?: string) => ({
  tool: 'mcp__images__show_image',
  tool_use_id: 'toolu_img',
  paths,
  ...(caption !== undefined && { caption }),
});

test('/img with no argument opens an empty history', async ($, on) => {
  const { opened } = stubImages(on);

  expect(await $.command.run({ ...TYPED, command: 'img', args: '' })).toEqual({});
  expect(opened).toEqual([{ id: 'img', title: 'Images', focus: true, closeOnEscape: true, rows: 24 }]);

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await ui.find({ type: 'Text', text: 'No images yet.' })).toBeDefined();
});

test('/img <path> records a one-off showing, and /img alone shows it again', async ($, on) => {
  const { opened } = stubImages(on);

  expect(await $.command.run({ ...TYPED, command: 'img', args: '/tmp/pic.png' })).toEqual({});
  expect(await $.command.run({ ...TYPED, command: 'img', args: '' })).toEqual({});
  expect(opened.length).toBe(2);

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  const picture = await ui.find({ key: 'img-0-0' });
  expect(picture).toMatchObject({ type: 'Image', props: { source: { png: PNG_1x1 }, columns: 1, rows: 1 } });
  expect(JSON.stringify(picture?.props)).toMatch(/"alt":"Image \/tmp\/pic\.png/);
  expect(await ui.find({ type: 'Text', text: /^\d\d:\d\d:\d\d$/ })).toBeDefined();
  expect(await ui.find({ key: 'img-1-0' })).toBeUndefined();
});

test('show_image adds to the history newest first, with caption and time, and answers ok', async ($, on) => {
  const { opened } = stubImages(on);

  expect((await $.tool.call(showImage(['/tmp/old.png']))).result).toBe('ok');
  expect((await $.tool.call(showImage(['/tmp/a.png', '~/b.png'], 'Before and after'))).result).toBe('ok');
  expect(opened[0]).toEqual({ id: 'img', title: 'Images', closeOnEscape: true, rows: 24 });

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await ui.find({ type: 'Text', text: 'Before and after' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /^\/tmp\/[a-z]+\.png · 1x1px$/ })).toMatchObject({ text: '/tmp/a.png · 1x1px' });
  expect(await ui.find({ key: 'img-0-1' })).toMatchObject({ type: 'Image' });
  expect(JSON.stringify((await ui.find({ key: 'img-0-1' }))?.props)).toMatch(/\/home\/me\/b\.png/);
  expect(JSON.stringify((await ui.find({ key: 'img-1-0' }))?.props)).toMatch(/\/tmp\/old\.png/);
});

test('the history keeps the newest 30 showings and drops the converted copies of the rest', async ($, on) => {
  const { runs } = stubImages(on);

  for (let index = 1; index <= 31; index += 1) await $.tool.call(showImage([`/tmp/p${index}.png`]));

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await ui.find({ type: 'Text', text: /^\/tmp\/p\d+\.png/ })).toMatchObject({ text: '/tmp/p31.png · 1x1px' });
  expect(await ui.find({ key: 'img-29-0' })).toBeDefined();
  expect(await ui.find({ key: 'img-30-0' })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: '/tmp/p1.png · 1x1px' })).toBeUndefined();
  expect(runs.some((argv) => /^rm -f -- \/var\/tmp-test\/claude-images\/sess-1\/img-[0-9a-f]{8}\.png$/.test(argv.join(' ')))).toBe(true);
});

test('show_image says ok when the pane waits for width, and tells the person with a toast', async ($, on) => {
  const { toasts } = stubImages(on, { isPlaced: false });

  expect((await $.tool.call(showImage(['/tmp/a.png']))).result).toBe('ok');
  expect(toasts).toEqual(['Image ready · /img']);
});

test('show_image converts a JPEG with sips into an inline PNG, clearing old sessions\' folders', async ($, on) => {
  const { runs, conversions } = stubImages(on, {
    sources: { '/x/photo.jpg': { size: 3_000_000, base64: '/9j/4AAQSkZJRgABAQ' } },
    sips: { probe: '/x/photo.jpg\n  pixelWidth: 4032\n  pixelHeight: 3024\n', exitCode: 0 },
  });

  expect((await $.tool.call(showImage(['/x/photo.jpg']))).result).toBe('ok');

  const [convert = []] = conversions();
  expect(convert.slice(0, 7)).toEqual(['sips', '-s', 'format', 'png', '-Z', '1600', '/x/photo.jpg']);
  expect(convert[8]).toMatch(/^\/var\/tmp-test\/claude-images\/sess-1\/img-[0-9a-f]{8}\.png$/);
  expect(runs.map((argv) => argv.join(' '))).toContain('rm -rf -- /var/tmp-test/claude-images/old-session');

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await ui.find({ key: 'img-0-0' })).toMatchObject({ type: 'Image', props: { source: { png: PNG_1x1 } } });
});

test('a converted image is not converted again on redraws or later showings', async ($, on) => {
  const { conversions } = stubImages(on, {
    sources: { '/x/photo.jpg': { size: 3_000_000, base64: '/9j/4AAQSkZJRgABAQ' } },
    sips: { probe: '  pixelWidth: 800\n  pixelHeight: 600\n', exitCode: 0 },
  });

  await $.tool.call(showImage(['/x/photo.jpg']));
  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  await ui.unmount();
  await $.tool.call(showImage(['/x/photo.jpg'], 'again'));
  await $.command.run({ ...TYPED, command: 'img', args: '' });
  const again = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await again.find({ key: 'img-1-0' })).toMatchObject({ type: 'Image' });

  expect(conversions().length).toBe(1);
  expect(conversions()[0]?.includes('-Z')).toBe(false);
});

test('a copy converted before (an earlier load of the mod) is read back without sips', async ($, on) => {
  const { conversions } = stubImages(on, {
    sources: { '/x/photo.heic': { size: 3_000_000, base64: 'AAAAHGZ0eXBoZWlj' } },
    sips: { probe: '  pixelWidth: 4032\n  pixelHeight: 3024\n', exitCode: 0 },
    isConvertedOnDisk: true,
  });

  expect((await $.tool.call(showImage(['/x/photo.heic']))).result).toBe('ok');
  expect(conversions()).toEqual([]);
});

test('show_image reports a conversion failure tersely and opens nothing', async ($, on) => {
  const { opened } = stubImages(on, {
    sources: { '/tmp/notes.txt': { size: 4, base64: 'aGVsbG8=' } },
    sips: { probe: '', exitCode: 1, stderr: 'Error: unable to read' },
  });

  expect((await $.tool.call(showImage(['/tmp/notes.txt']))).result).toBe('error: /tmp/notes.txt: unsupported format');
  expect(opened).toEqual([]);
});

test('/img shrinks an oversized PNG so it goes inline', async ($, on) => {
  const { conversions } = stubImages(on, {
    sources: { '/x/huge.png': { size: 3_000_000, base64: PNG_4000x3000 } },
    sips: { probe: '  pixelWidth: 4000\n  pixelHeight: 3000\n', exitCode: 0 },
  });

  expect(await $.command.run({ ...TYPED, command: 'img', args: '/x/huge.png' })).toEqual({});
  expect(conversions()[0]?.slice(0, 7)).toEqual(['sips', '-s', 'format', 'png', '-Z', '1600', '/x/huge.png']);

  const ui = await $.ui.mount(IMG_PANE_MOUNT);
  expect(await ui.find({ key: 'img-0-0' })).toMatchObject({ type: 'Image', props: { source: { png: PNG_1x1 } } });
});
