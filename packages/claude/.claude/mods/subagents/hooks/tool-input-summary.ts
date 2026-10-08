const PRIMARY_KEYS = [
  'command',
  'file_path',
  'notebook_path',
  'pattern',
  'path',
  'url',
  'query',
  'skill',
  'description',
  'subject',
  'prompt',
];

const ENVELOPE_KEYS = ['tool', 'tool_use_id', 'agentId'];

export function oneLine(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function tail(text: string, max: number) {
  const flat = text.replace(/\s+/g, ' ').trim();

  return flat.length > max ? `…${flat.slice(flat.length - max + 1)}` : flat;
}

/** One short line for a tool call's input: the Bash command, the file path, the pattern, ... */
export function summarizeToolInput(input: Readonly<Record<string, unknown>>, max = 140) {
  for (const key of PRIMARY_KEYS) {
    const value = input[key];
    if (typeof value !== 'string' || value.trim() === '') continue;

    const where = input.path;
    if (key === 'pattern' && typeof where === 'string' && where !== '') return oneLine(`${value} in ${where}`, max);

    return oneLine(value, max);
  }

  const rest = Object.fromEntries(Object.entries(input).filter(([key]) => !ENVELOPE_KEYS.includes(key)));
  return Object.keys(rest).length === 0 ? '' : oneLine(JSON.stringify(rest), max);
}
