export type AgentLogLine = {
  /** The tool_use_id of a tool line, so its result can mark it. */
  id?: string;
  kind: 'tool' | 'text' | 'note';
  text: string;
  state?: 'run' | 'ok' | 'err';
};

export type TrackedAgent = {
  id: string;
  type: string;
  description: string;
  status: string;
  startedAt: number;
  endedAt?: number;
  tools: number;
  /** Short model id, from the spawn's resolved model, then each model request. */
  model?: string;
  /** Effort of the agent's latest model request; absent for a model without effort. */
  effort?: string;
  /** Tail of the text the agent is streaming right now. */
  live?: string;
  lines: AgentLogLine[];
};

export type AgentBoard = {
  agents: TrackedAgent[];
  /** When the board was last written, for elapsed times of running agents. */
  at: number;
  /** The batch's pane was closed by the 15s timer; its agents are no longer "recent". */
  isBatchClosed?: boolean;
  /** The agents pane is placed and is the pane shown; the band stays out of its way. */
  isPaneShown?: boolean;
};

declare module 'claude-code' {
  interface PluginState {
    subagents: {
      board: AgentBoard;
      tab: string;
    };
  }
}
