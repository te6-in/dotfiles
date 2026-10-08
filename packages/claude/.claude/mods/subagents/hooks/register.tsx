import { atom, read, update } from 'claude-code';
import type { Register, Timer } from 'claude-code';
import type { AgentLogLine, TrackedAgent } from '../types';
import {
  LOG_LINES,
  TICK_MS,
  agentDone,
  agentHeading,
  applyListed,
  hydrate,
  isIdle,
  isSettled,
  noteSpawn,
  planTick,
  requestPaneCheck,
  setPaneShown,
  snapshot,
  stepChunk,
  stepEnded,
  stepStarted,
  toolEnded,
  toolStarted,
  track,
} from './agent-board';

const AGENTS_PANE = 'agents';
const AGENTS_TITLE = 'Subagents';

const board = atom({ plugin: 'subagents', key: 'board' } as const, {
  agents: [],
  at: 0,
  isBatchClosed: false,
  isPaneShown: false,
});
const tab = atom({ plugin: 'subagents', key: 'tab' } as const, 'all');

const STATUS_COLOR: Readonly<Record<string, string>> = {
  pending: 'inactive',
  running: 'warning',
  waiting: 'warning',
  idle: 'inactive',
  completed: 'success',
  failed: 'error',
  killed: 'error',
};

/** 0 is All; agents 1-9 take digits, 10-35 lowercase letters (no letter is bound inside a pane). */
const TAB_KEYS = [...'123456789abcdefghijklmnopqrstuvwxyz'];

const LINE_MARK = { run: '·', ok: '✓', err: '✗' } as const satisfies Record<NonNullable<AgentLogLine['state']>, string>;

let ticker: Timer | undefined;
let isTicking = false;

/**
 * Starts the ticker that writes the board and opens/closes the pane. Set by
 * `session.start`, the one hook whose `$` the ticker uses, since the engine
 * refuses a module that passes `$` around.
 */
let wake: () => void = () => undefined;

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    // An observer never lets its own bookkeeping fail the call it watches.
  }
}

function observe(fn: () => void) {
  safe(fn);
  safe(wake);
}

const lineText = (line: AgentLogLine) =>
  line.kind === 'tool' ? `  ${LINE_MARK[line.state ?? 'run']} ${line.text}` : line.kind === 'text' ? `  » ${line.text}` : `  ${line.text}`;

const elapsed = (agent: TrackedAgent, at: number) =>
  `${Math.max(0, Math.round(((agent.endedAt ?? at) - agent.startedAt) / 1000))}s`;

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const tick = async () => {
      if (isTicking) return;

      isTicking = true;
      try {
        const plan = planTick();
        if (plan.shouldOpen && !(await $.ui.panes()).some((pane) => pane.id === AGENTS_PANE)) {
          const opened = await $.ui.open({ id: AGENTS_PANE, title: AGENTS_TITLE, closeOnEscape: true });
          if (!opened.isPlaced) $.ui.toast('Subagents pane waits for a 144-column terminal. Run /agents-pane to show it now.');
        }
        if (plan.shouldSync) applyListed(await $.agent.list());
        if (plan.shouldCheckPanes || plan.shouldOpen) {
          setPaneShown((await $.ui.panes()).some((pane) => pane.id === AGENTS_PANE && pane.isPlaced && pane.isShown));
        }
        if (plan.shouldClose) await $.ui.close({ id: AGENTS_PANE });
        if (plan.shouldFlush) await update($, board, () => snapshot());
      } catch (error) {
        $.ui.log(`subagents: tick failed: ${String(error)}`, { to: 'debug' });
      } finally {
        isTicking = false;
      }
      if (isIdle()) {
        ticker?.cancel();
        ticker = undefined;
      }
    };
    wake = () => {
      if (ticker === undefined) ticker = $.clock.every(TICK_MS, tick);
    };

    try {
      await $.command.register({ name: 'agents-pane', description: 'Show the live subagents pane', immediate: true });
      hydrate(await read($, board));
      wake();
    } catch (error) {
      $.ui.log(`subagents: setup failed: ${String(error)}`, { to: 'debug' });
    }
    return next(e);
  });

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e);
    const { agentId } = spawned;
    if (agentId !== undefined) {
      observe(() =>
        noteSpawn(agentId, {
          type: e.subagentType,
          description: e.description,
          model: spawned.model,
          detail: `started${e.background ? ' in background' : ''}`,
        }),
      );
    }
    return spawned;
  }).catch(($, e, next) => next(e));
  on('tool.call', async ($, e, next) => {
    const { agentId } = e;
    if (agentId === undefined) return next(e);

    observe(() => toolStarted(agentId, e, e.tool, e.tool_use_id));
    const result = await next(e);
    observe(() => toolEnded(agentId, e.tool_use_id, result));
    return result;
  }).catch(($, e, next) => next(e));
  on('turn.step', async function* ($, e, next) {
    const { agentId } = e;
    if (agentId === undefined) return yield* next(e);

    observe(() => stepStarted(agentId, e.model, e.effort));
    try {
      for await (const chunk of next(e)) {
        observe(() => stepChunk(agentId, chunk));
        yield chunk;
      }
    } finally {
      observe(() => stepEnded(agentId));
    }
  });
  on('turn.complete', ($, e, next) => {
    const { agentId } = e;
    if (agentId !== undefined) observe(() => agentDone(agentId, e));
    return next(e);
  }).catch(($, e, next) => next(e));
  on('ui.close', { id: AGENTS_PANE }, ($, e, next) => {
    observe(requestPaneCheck);
    return next(e);
  }).catch(($, e, next) => next(e));
  on('command.run', { command: 'agents-pane' }, async ($) => {
    const opened = await $.ui.open({ id: AGENTS_PANE, title: AGENTS_TITLE, focus: true, closeOnEscape: true });
    observe(requestPaneCheck);
    return opened.isPlaced ? {} : { text: `Subagents pane is waiting: ${opened.reason}` };
  }).catch(() => ({ text: 'agents-pane: could not open the pane (see claude --debug)' }));
  on('ui.render', { component: 'Pane', requestId: AGENTS_PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    try {
      const { agents: list, at } = await read($, board);
      const picked = await read($, tab);

      const selected = list.find((agent) => agent.id === picked);
      const running = list.filter((agent) => !isSettled(agent.status)).length;
      const perAgent =
        selected !== undefined
          ? LOG_LINES
          : Math.max(2, Math.floor((Math.max(8, e.props.scroll.bodyRows) - 3) / Math.max(1, list.length)) - 1);

      return (
        <Box flexDirection="column">
          <Text bold>{`${AGENTS_TITLE}: ${running} running, ${list.length - running} done`}</Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Button key="tab-all" label="All" hotkey="0" plain dimColor={selected !== undefined} onPress={() => update($, tab, () => 'all')} />
            {list.slice(0, TAB_KEYS.length).map((agent, index) => (
              <Button
                key={`tab-${TAB_KEYS[index] ?? index}`}
                label={agent.type}
                hotkey={TAB_KEYS[index]}
                plain
                dimColor={selected?.id !== agent.id}
                onPress={() => update($, tab, () => agent.id)}
              />
            ))}
          </Box>
          {list.length === 0 && <Text dimColor>No subagents yet. They show here once Claude starts one.</Text>}
          {(selected === undefined ? list : [selected]).map((agent) => (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="row" columnGap={1}>
                <Text color={STATUS_COLOR[agent.status] ?? 'text'}>●</Text>
                <Text bold>{agentHeading(agent)}</Text>
                <Text wrap="truncate-end">{agent.description}</Text>
                <Text dimColor wrap="truncate-end">
                  {`${agent.status} ${elapsed(agent, at)} · ${agent.tools} tools`}
                </Text>
              </Box>
              {agent.lines.slice(-perAgent).map((line) => (
                <Text
                  wrap="truncate-end"
                  dimColor={line.kind === 'note' || line.state === 'ok'}
                  {...(line.state === 'err' && { color: 'error' })}
                  {...(line.kind === 'text' && { italic: true })}
                >
                  {lineText(line)}
                </Text>
              ))}
              {agent.live !== undefined && (
                <Text wrap="truncate-start" color="claude">
                  {`  ▸ ${agent.live}`}
                </Text>
              )}
            </Box>
          ))}
          <Text dimColor wrap="truncate-end">
            {`0-9, a-z tabs · ctrl+x x or Esc closes${running === 0 && list.length > 0 ? ' · closes itself 15s after the last agent ends' : ''}`}
          </Text>
        </Box>
      );
    } catch (error) {
      return <Text color="error">{`subagents: ${String(error)}`}</Text>;
    }
  });
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);

    try {
      const shown = await read($, board);
      if (shown.agents.length === 0 || shown.isBatchClosed === true || shown.isPaneShown === true) return next(e);

      const running = shown.agents.filter((agent) => !isSettled(agent.status)).length;
      const { Text } = $.ui.resolve(e);
      return (
        <Text wrap="truncate-end">
          {`${AGENTS_TITLE}: ${running} running · ${shown.agents.length - running} done — /agents-pane`}
        </Text>
      );
    } catch {
      return next(e);
    }
  });
};
