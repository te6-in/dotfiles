/**
 * Whether this terminal draws an `Image` (kitty graphics with Unicode
 * placeholders): Ghostty or kitty, not under tmux or screen. The engine's own
 * detection result is not exposed to plugins, so this reads the environment.
 */
export function canDrawImages(env: { termProgram?: string; term?: string; tmux?: string; sty?: string }) {
  if ((env.tmux ?? '') !== '' || (env.sty ?? '') !== '') return false;

  return (env.termProgram ?? '').toLowerCase() === 'ghostty' || env.term === 'xterm-kitty' || env.term === 'xterm-ghostty';
}

/**
 * How images reach the person here: `pane`, an `Image` in a pane of this
 * terminal; `orca`, a split pane Orca opens through its `showimg` command;
 * `none`, nowhere.
 */
export function displayOf(env: Parameters<typeof canDrawImages>[0] & { orcaPaneKey?: string }) {
  if (canDrawImages(env)) return 'pane';
  if ((env.orcaPaneKey ?? '') !== '') return 'orca';

  return 'none';
}

/** An absolute path for what was typed or passed: absolute, `~/…`, or relative to the session's folder. */
export async function resolveImagePath(raw: string, where: { home: () => Promise<string>; cwd: () => Promise<string> }) {
  const path = raw.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (path.startsWith('/')) return path;
  if (path === '~' || path.startsWith('~/')) return `${await where.home()}${path.slice(1)}`;

  return `${(await where.cwd()).replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
