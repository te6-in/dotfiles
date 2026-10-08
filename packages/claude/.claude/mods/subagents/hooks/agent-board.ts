import type { AgentInfo, ToolCallResult, TurnCompleteInput, TurnStepChunk } from 'claude-code';
import type { AgentBoard, AgentLogLine, TrackedAgent } from '../types';
import { oneLine, summarizeToolInput, tail } from './tool-input-summary';

export const LOG_LINES = 30;
export const TICK_MS = 300;
const MAX_AGENTS = 40;
const SYNC_TICKS = 7;
const CLOSE_TICKS = Math.ceil(15_000 / TICK_MS);
const STREAM_KEEP = 400;

/**
 * The subagents the pane shows, held in module memory: hooks mutate it with no
 * `$` call, and the ticker `session.start` owns writes it to `$.state`.
 */
const agents = new Map<string, TrackedAgent>();
const streams = new Map<string, { head: string; tail: string }>();

const flags = {
  isDirty: false,
  wantsOpen: false,
  isBatchClosed: false,
  isPaneShown: false,
  wantsPaneCheck: false,
  closeIn: undefined as number | undefined,
  ticks: 0,
};

export const isSettled = (status: string) =>
  status === 'completed' || status === 'failed' || status === 'killed' || status === 'idle';

const allSettled = () => [...agents.values()].every((agent) => isSettled(agent.status));

function pushLine(agent: TrackedAgent, line: AgentLogLine) {
  agent.lines.push(line);
  if (agent.lines.length > LOG_LINES) agent.lines.splice(0, agent.lines.length - LOG_LINES);
}

export function snapshot(): AgentBoard {
  return {
    agents: [...agents.values()].map((agent) => ({ ...agent, lines: agent.lines.map((line) => ({ ...line })) })),
    at: Date.now(),
    isBatchClosed: flags.isBatchClosed,
    isPaneShown: flags.isPaneShown,
  };
}

export function hydrate(saved: AgentBoard) {
  if (agents.size > 0) return;

  for (const agent of saved.agents) agents.set(agent.id, { ...agent, lines: agent.lines.map((line) => ({ ...line })) });
  flags.isBatchClosed = saved.isBatchClosed ?? false;
  flags.isPaneShown = saved.isPaneShown ?? false;
  flags.isDirty = saved.agents.length > 0;
  flags.wantsPaneCheck = saved.agents.length > 0;
}

/**
 * `claude-sonnet-5-20261001` → `sonnet-5`; Bedrock (`us.anthropic.…-v1:0`),
 * Vertex (`…@20261001`) and gateway (`org/…`) spellings alike.
 */
export const shortModel = (model: string) =>
  model
    .slice(model.lastIndexOf('/') + 1)
    .replace(/^([a-z]+\.)?anthropic\./, '')
    .replace(/^claude-/, '')
    .replace(/-v\d+:\d+$/, '')
    .replace(/[-@]\d{8}$/, '');

export const agentHeading = (agent: Pick<TrackedAgent, 'type' | 'model' | 'effort'>) =>
  [agent.type, agent.model, agent.effort].filter((part) => part !== undefined && part !== '').join(' · ');

export function requestPaneCheck() {
  flags.wantsPaneCheck = true;
}

export function setPaneShown(isShown: boolean) {
  if (flags.isPaneShown === isShown) return;

  flags.isPaneShown = isShown;
  flags.isDirty = true;
}

export function reset() {
  agents.clear();
  streams.clear();
  Object.assign(flags, {
    isDirty: false,
    wantsOpen: false,
    isBatchClosed: false,
    isPaneShown: false,
    wantsPaneCheck: false,
    closeIn: undefined,
    ticks: 0,
  });
}

/** Starts tracking an agent; true when it is new, which asks for the pane. */
export function track(id: string, type?: string, description?: string) {
  const known = agents.get(id);
  if (known !== undefined) {
    if (type !== undefined && type !== '' && known.type === 'agent') known.type = type;
    if (description !== undefined && description !== '' && known.description === '') known.description = description;
    return false;
  }

  if (flags.isBatchClosed) {
    for (const [key, agent] of agents) if (isSettled(agent.status)) agents.delete(key);
    flags.isBatchClosed = false;
  }

  agents.set(id, {
    id,
    type: type !== undefined && type !== '' ? type : 'agent',
    description: description ?? '',
    status: 'running',
    startedAt: Date.now(),
    tools: 0,
    lines: [],
  });
  for (const [key, agent] of agents) {
    if (agents.size <= MAX_AGENTS) break;
    if (isSettled(agent.status)) agents.delete(key);
  }

  flags.closeIn = undefined;
  flags.wantsOpen = true;
  flags.isDirty = true;
  return true;
}

function revive(agent: TrackedAgent) {
  if (!isSettled(agent.status)) return;

  agent.status = 'running';
  agent.endedAt = undefined;
  flags.closeIn = undefined;
}

export function noteSpawn(agentId: string, spawn: { type: string; description: string; model: string; detail: string }) {
  track(agentId, spawn.type, spawn.description);
  const agent = agents.get(agentId);
  if (agent === undefined) return;

  if (agent.model === undefined && spawn.model !== '') agent.model = shortModel(spawn.model);
  if (agent.lines.length === 0) pushLine(agent, { kind: 'note', text: spawn.detail });
}

/** A model request of the agent's loop: the model and effort it is about to be sent with. */
export function stepStarted(agentId: string, model: string, effort: string | number | undefined) {
  track(agentId);
  const agent = agents.get(agentId);
  if (agent === undefined) return;

  agent.model = shortModel(model);
  agent.effort = effort === undefined ? undefined : String(effort);
  flags.isDirty = true;
}

export function toolStarted(agentId: string, input: Readonly<Record<string, unknown>>, tool: string, toolUseId: string) {
  track(agentId);
  const agent = agents.get(agentId);
  if (agent === undefined) return;

  revive(agent);
  agent.tools += 1;
  const summary = summarizeToolInput(input);
  pushLine(agent, { id: toolUseId, kind: 'tool', state: 'run', text: summary === '' ? tool : `${tool}: ${summary}` });
  flags.isDirty = true;
}

export function toolEnded(agentId: string, toolUseId: string, result: ToolCallResult) {
  const line = agents.get(agentId)?.lines.find((one) => one.id === toolUseId);
  if (line === undefined) return;

  line.state = result.deny !== undefined || result.isError === true ? 'err' : 'ok';
  if (result.deny !== undefined) line.text = `${line.text}  (denied)`;
  flags.isDirty = true;
}

export function stepChunk(agentId: string, chunk: TurnStepChunk) {
  const agent = agents.get(agentId);
  if (agent === undefined) return;

  const stream = streams.get(agentId) ?? { head: '', tail: '' };
  if (chunk.kind === 'thinking' && stream.head === '') {
    agent.live = 'thinking…';
    flags.isDirty = true;
    return;
  }
  if (chunk.kind !== 'text') return;

  const next = { head: `${stream.head}${chunk.text}`.slice(0, STREAM_KEEP), tail: `${stream.tail}${chunk.text}`.slice(-STREAM_KEEP) };
  streams.set(agentId, next);
  agent.live = tail(next.tail, 160);
  flags.isDirty = true;
}

export function stepEnded(agentId: string) {
  const agent = agents.get(agentId);
  const text = streams.get(agentId)?.head ?? '';
  streams.delete(agentId);
  if (agent === undefined) return;

  agent.live = undefined;
  if (text.trim() !== '') pushLine(agent, { kind: 'text', text: oneLine(text, 200) });
  flags.isDirty = true;
}

export function agentDone(agentId: string, e: TurnCompleteInput) {
  track(agentId);
  const agent = agents.get(agentId);
  if (agent === undefined) return;

  agent.status = e.isAborted ? 'killed' : e.reason === 'answer' ? 'completed' : 'failed';
  agent.endedAt = Date.now();
  agent.live = undefined;
  pushLine(agent, { kind: 'note', text: `${agent.status} after ${Math.round(e.durationMs / 100) / 10}s` });
  flags.isDirty = true;
}

/** Refreshes type, description and status from `$.agent.list()`, and adopts running agents no hook saw start. */
export function applyListed(listed: readonly AgentInfo[]) {
  for (const info of listed) {
    const agent = agents.get(info.id);
    if (agent === undefined) {
      if (info.status === 'running' || info.status === 'pending') track(info.id, info.type, info.description);
      continue;
    }

    const before = `${agent.type}|${agent.description}|${agent.status}`;
    if (agent.type === 'agent' && info.type !== '') agent.type = info.type;
    if (agent.description === '' && info.description !== '') agent.description = info.description;
    if (agent.status !== info.status && (isSettled(info.status) || !isSettled(agent.status))) {
      agent.status = info.status;
      if (isSettled(info.status)) agent.endedAt ??= Date.now();
    }
    if (`${agent.type}|${agent.description}|${agent.status}` !== before) flags.isDirty = true;
  }
}

/** What one tick of the ticker owes: which effects to run, and whether it may stop. */
export function planTick() {
  flags.ticks += 1;

  const shouldOpen = flags.wantsOpen;
  flags.wantsOpen = false;

  const shouldSync = !allSettled() && flags.ticks % SYNC_TICKS === 0;

  const shouldCheckPanes =
    flags.wantsPaneCheck || (agents.size > 0 && !flags.isBatchClosed && flags.ticks % SYNC_TICKS === 0);
  flags.wantsPaneCheck = false;

  let shouldClose = false;
  if (agents.size === 0 || !allSettled() || flags.isBatchClosed) flags.closeIn = undefined;
  else if (flags.closeIn === undefined) flags.closeIn = CLOSE_TICKS;
  else if (--flags.closeIn <= 0) {
    flags.closeIn = undefined;
    flags.isBatchClosed = true;
    flags.isPaneShown = false;
    flags.isDirty = true;
    shouldClose = true;
  }

  const shouldFlush = flags.isDirty;
  flags.isDirty = false;

  return { shouldOpen, shouldSync, shouldCheckPanes, shouldFlush, shouldClose };
}

export const isIdle = () =>
  !flags.isDirty &&
  !flags.wantsOpen &&
  !flags.wantsPaneCheck &&
  flags.closeIn === undefined &&
  allSettled() &&
  (agents.size === 0 || flags.isBatchClosed);
