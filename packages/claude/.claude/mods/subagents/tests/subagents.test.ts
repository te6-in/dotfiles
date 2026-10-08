import { expect, mock, test } from 'claude-code/testing';
import type { PaneOpenArgs } from 'claude-code';
import { shortModel } from '../hooks/agent-board';
import { summarizeToolInput } from '../hooks/tool-input-summary';

const BAND = {
  plugin: 'subagents',
  component: 'AbovePrompt',
  viewport: { columns: 100, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 95, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const;

const PANE = {
  plugin: 'subagents',
  component: 'Pane',
  requestId: 'agents',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'Subagents',
    isFocused: false,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const;

const SPAWN = {
  tool_use_id: 'toolu_spawn',
  prompt: 'Find where auth lives',
  description: 'Find auth code',
  subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-test',
  background: false,
  fork: false,
} as const;

// A command typed at the prompt of a narrow, non-fullscreen terminal, like an Orca pane.
const TYPED = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const;

test('a subagent opens the pane unasked, logs its tool calls and text, then the pane closes 15s after it ends', async ($, on) => {
  const clock = mock.clock(on);
  const opened: PaneOpenArgs[] = [];
  const closed: string[] = [];

  on('command.register', ($, e) => ({ value: { command: e.name } }));
  on('session.start', () => ({ cwd: '/work' }));
  on('ui.panes', () => ({ value: [] }));
  on('ui.open', ($, e) => {
    opened.push(e);
    return { value: { isPlaced: true } };
  });
  on('ui.close', ($, e) => {
    closed.push(e.id);
    return { value: undefined };
  });
  on('ui.toast', () => ({ value: undefined }));
  on('ui.log', () => ({ value: undefined }));
  on('agent.list', () => ({ value: [] }));
  on('agent.spawn', () => ({ model: 'claude-test', agentId: 'a1' }));
  on('tool.call', () => ({ result: 'ok' }));
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Auth lives in ' };
    yield { kind: 'text', index: 0, text: 'src/auth/session.ts.' };
    return { turnId: e.turnId, index: e.index, answer: 'Auth lives in src/auth/session.ts.', toolUses: [], stopReason: 'end_turn', usage: null };
  });
  on('turn.complete', () => ({ text: '' }));

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  await $.agent.spawn(SPAWN);

  const ran = await $.tool.call({ tool: 'Bash', command: 'rg -n login src', tool_use_id: 'toolu_1', agentId: 'a1' });
  expect(ran).toMatchObject({ result: 'ok' });
  await $.tool.call({ tool: 'Read', file_path: '/work/src/auth/session.ts', tool_use_id: 'toolu_2', agentId: 'a1' });

  const stream = $.turn.step({
    turnId: 'turn-a1',
    index: 0,
    model: 'claude-sonnet-5-20261001',
    effort: 'low',
    messageCount: 3,
    agentId: 'a1',
  });
  let step = await stream.next();
  while (step.done !== true) step = await stream.next();
  expect(step.value).toMatchObject({ answer: 'Auth lives in src/auth/session.ts.' });

  await clock.advance(300);
  expect(opened.length).toBe(1);
  expect(opened[0]).toMatchObject({ id: 'agents', closeOnEscape: true });
  expect(opened[0]?.focus).toBeUndefined();

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: 'Explore · sonnet-5 · low' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Find auth code' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /✓ Bash: rg -n login src/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /Read: \/work\/src\/auth\/session\.ts/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /» Auth lives in src\/auth\/session\.ts\./ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /1 running, 0 done/ })).toBeDefined();

  await $.turn.complete({ turnId: 'turn-a1', answer: 'done', durationMs: 1200, isAborted: false, reason: 'answer', agentId: 'a1' });
  await clock.advance(300);
  expect(await ui.find({ type: 'Text', text: /0 running, 1 done/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /completed after 1\.2s/ })).toBeDefined();

  await clock.advance(10_000);
  expect(closed).toEqual([]);
  await clock.advance(6_000);
  expect(closed).toEqual(['agents']);
  await ui.unmount();
});

test('a new subagent before the 15s are up keeps the pane open', async ($, on) => {
  const clock = mock.clock(on);
  const closed: string[] = [];
  let next = 0;

  on('command.register', ($, e) => ({ value: { command: e.name } }));
  on('session.start', () => ({ cwd: '/work' }));
  on('ui.panes', () => ({ value: [{ id: 'agents', title: 'Subagents', isShown: true, isFocused: false, isPlaced: true }] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('ui.close', ($, e) => {
    closed.push(e.id);
    return { value: undefined };
  });
  on('ui.log', () => ({ value: undefined }));
  on('agent.list', () => ({ value: [] }));
  on('agent.spawn', () => ({ model: 'claude-test', agentId: `a${(next += 1)}` }));
  on('turn.complete', () => ({ text: '' }));

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  await $.agent.spawn(SPAWN);
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer', agentId: 'a1' });
  await clock.advance(10_000);

  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_spawn_2' });
  await clock.advance(10_000);
  expect(closed).toEqual([]);

  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 10, isAborted: true, reason: 'aborted', agentId: 'a2' });
  await clock.advance(16_000);
  expect(closed).toEqual(['agents']);
});

test('the hooks only observe: spawn, tool call and model request reach the engine unchanged', async ($, on) => {
  const seen: unknown[] = [];
  on('agent.spawn', ($, e) => {
    seen.push(e);
    return { model: 'claude-opus-5', agentId: 'a1' };
  });
  on('tool.call', ($, e) => {
    seen.push(e);
    return { result: 'ok' };
  });
  on('turn.step', async function* ($, e) {
    seen.push(e);
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null };
  });

  const spawned = await $.agent.spawn({ ...SPAWN, model: 'haiku' });
  expect(spawned).toEqual({ model: 'claude-opus-5', agentId: 'a1' });
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'toolu_1', agentId: 'a1' });
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5', effort: 'high', messageCount: 1, agentId: 'a1' });
  while ((await stream.next()).done !== true);

  expect(seen[0]).toMatchObject({ ...SPAWN, model: 'haiku' });
  expect(seen[1]).toMatchObject({ tool: 'Bash', command: 'ls', tool_use_id: 'toolu_1', agentId: 'a1' });
  expect(seen[2]).toMatchObject({ model: 'claude-opus-5', effort: 'high', agentId: 'a1' });
});

test('the band shows a one-line summary while the agents pane is not on screen', async ($, on) => {
  const clock = mock.clock(on);
  let isPaneShown = false;

  on('command.register', ($, e) => ({ value: { command: e.name } }));
  on('session.start', () => ({ cwd: '/work' }));
  on('ui.panes', () => ({
    value: isPaneShown ? [{ id: 'agents', title: 'Subagents', isShown: true, isFocused: false, isPlaced: true }] : [],
  }));
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'unasked panes need 144 columns; this terminal has 100' } }));
  on('ui.close', () => ({ value: undefined }));
  on('ui.toast', () => ({ value: undefined }));
  on('ui.log', () => ({ value: undefined }));
  on('agent.list', () => ({ value: [] }));
  on('agent.spawn', ($, e) => ({ model: 'claude-test', agentId: e.tool_use_id }));
  on('turn.complete', () => ({ text: '' }));
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }));

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' });
  expect(await band.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined();

  await $.agent.spawn({ ...SPAWN, tool_use_id: 'a1' });
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'a2' });
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: false, reason: 'answer', agentId: 'a1' });
  await clock.advance(600);
  expect(await band.find({ type: 'Text', text: 'Subagents: 1 running · 1 done — /agents-pane' })).toBeDefined();

  // The person opens the pane: the band steps aside.
  isPaneShown = true;
  await $.command.run({ ...TYPED, command: 'agents-pane', args: '' });
  await clock.advance(600);
  expect(await band.find({ type: 'Text', text: /\/agents-pane/ })).toBeUndefined();
  expect(await band.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined();

  // Pane closed again: back to the band until the batch's 15s are up.
  isPaneShown = false;
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 10, isAborted: false, reason: 'answer', agentId: 'a2' });
  await clock.advance(2_400);
  expect(await band.find({ type: 'Text', text: 'Subagents: 0 running · 2 done — /agents-pane' })).toBeDefined();
  await clock.advance(16_000);
  expect(await band.find({ type: 'Text', text: /\/agents-pane/ })).toBeUndefined();
  await band.unmount();
});

test('agents past nine get letter tabs a-z', async ($, on) => {
  const clock = mock.clock(on);

  on('command.register', ($, e) => ({ value: { command: e.name } }));
  on('session.start', () => ({ cwd: '/work' }));
  on('ui.panes', () => ({ value: [] }));
  on('ui.open', () => ({ value: { isPlaced: true } }));
  on('ui.log', () => ({ value: undefined }));
  on('agent.list', () => ({ value: [] }));
  on('agent.spawn', ($, e) => ({ model: 'claude-test', agentId: e.tool_use_id }));

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  for (let index = 1; index <= 11; index += 1) {
    await $.agent.spawn({ ...SPAWN, tool_use_id: `agent-${index}`, description: `Task ${index}` });
  }
  await clock.advance(300);

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' });
  expect(await ui.find({ key: 'tab-9' })).toMatchObject({ type: 'Button', props: { hotkey: '9' } });
  expect(await ui.find({ key: 'tab-a' })).toMatchObject({ type: 'Button', props: { hotkey: 'a' } });
  expect(await ui.find({ key: 'tab-b' })).toMatchObject({ type: 'Button', props: { hotkey: 'b' } });
  expect(await ui.find({ key: 'tab-c' })).toBeUndefined();

  await ui.press({ key: 'tab-b' });
  expect(await ui.find({ type: 'Text', text: 'Task 11' })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: 'Task 10' })).toBeUndefined();
  await ui.unmount();
});

test('a hook failure never breaks a tool call', async ($, on) => {
  on('tool.call', () => ({ result: 'still ran' }));

  // No session.start, no stubs for the pane: the observer must stay out of the way.
  const out = await $.tool.call({ tool: 'Bash', command: 'echo hi', tool_use_id: 'toolu_x', agentId: 'ghost' });
  expect(out).toMatchObject({ result: 'still ran' });
});

test('the main loop\'s model stream passes through untouched', async ($, on) => {
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'hello' };
    return { turnId: e.turnId, index: e.index, answer: 'hello', toolUses: [], stopReason: 'end_turn', usage: null };
  });

  const chunks: unknown[] = [];
  const stream = $.turn.step({ turnId: 'main', index: 0, model: 'claude-test', messageCount: 1 });
  let step = await stream.next();
  while (step.done !== true) {
    chunks.push(step.value);
    step = await stream.next();
  }
  expect(chunks).toEqual([{ kind: 'text', index: 0, text: 'hello' }]);
  expect(step.value).toMatchObject({ answer: 'hello', stopReason: 'end_turn' });
});

test('/agents-pane opens the pane with focus and Esc to close', async ($, on) => {
  const opened: PaneOpenArgs[] = [];
  on('ui.open', ($, e) => {
    opened.push(e);
    return { value: { isPlaced: true } };
  });

  await $.command.run({ ...TYPED, command: 'agents-pane', args: '' });
  expect(opened).toEqual([{ id: 'agents', title: 'Subagents', focus: true, closeOnEscape: true }]);

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' });
  expect(await ui.find({ type: 'Text', text: /No subagents yet/ })).toBeDefined();
});

test('tool input summaries and model names', () => {
  expect(summarizeToolInput({ tool: 'Bash', tool_use_id: 'x', command: 'git   status\n--short' })).toBe('git status --short');
  expect(summarizeToolInput({ tool: 'Grep', pattern: 'login', path: 'src' })).toBe('login in src');
  expect(summarizeToolInput({ tool: 'TodoWrite', todos: [] })).toBe('{"todos":[]}');
  expect(shortModel('claude-sonnet-5-20261001')).toBe('sonnet-5');
  expect(shortModel('claude-opus-4-7[1m]')).toBe('opus-4-7[1m]');
  expect(shortModel('us.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe('haiku-4-5');
  expect(shortModel('claude-sonnet-4-5@20250929')).toBe('sonnet-4-5');
});
