import { describe, expect, it } from 'vitest';
import { renderTuiLines, type TuiState } from '../src/tui-render.js';

/**
 * The tool card and the diff card used to sit in the `else` of the live block,
 * reachable only while NOT streaming. currentTool is assigned in exactly one
 * place, and the same state update appends the delta to state.streaming, so
 * "currentTool is set" implied "streaming is non-empty" and the first branch
 * always won. Neither card could appear at runtime.
 *
 * The existing suite never caught it because its base state pins streaming to
 * the empty string, so the combination it asserts on cannot occur in the
 * running program. These cases deliberately set BOTH.
 */

function state(over: Partial<TuiState> = {}): TuiState {
  return {
    view: 'chat', overlay: 'none', model: 'cli-codex/first',
    sessionId: 's', sessionTitle: 'CLI chat', messages: [],
    input: '', cursor: 0, filter: '', selected: 0,
    models: [{ id: 'cli-codex/first' }], sessions: [], runs: [], workspaces: [],
    git: { detected: true, branch: 'main', files: 0, name: 'conduit-bridge' },
    host: '127.0.0.1:31338', notice: '',
    busy: true, streaming: '', width: 120, height: 40,
    ...over,
  } as unknown as TuiState;
}

const frame = (over: Partial<TuiState>) => renderTuiLines(state(over)).lines.join('\n');

describe('the tool card is visible while text is streaming', () => {
  it('shows the running tool even though a delta has already arrived', () => {
    // This is the real runtime combination: currentTool set AND streaming
    // non-empty, because both come from the same state update.
    const painted = frame({
      streaming: 'die Antwort laeuft bereits',
      status: 'streaming',
      currentTool: { name: 'read_file', target: 'src/server.ts' },
    });
    expect(painted).toContain('read_file');
    expect(painted).toContain('src/server.ts');
    // And the streamed text is still there: the card must not replace it.
    expect(painted).toContain('die Antwort laeuft bereits');
  });

  it('shows the tool card while thinking, which already worked', () => {
    const painted = frame({ streaming: '', currentTool: { name: 'run_shell' } });
    expect(painted).toContain('run_shell');
    expect(painted).toContain('Thinking');
  });

  it('reports the tool status it was given instead of always saying running', () => {
    expect(frame({ streaming: 'x', currentTool: { name: 't', status: 'failed' } })).toContain('failed');
    expect(frame({ streaming: 'x', currentTool: { name: 't', status: 'completed' } })).toContain('completed');
    // Absent status keeps the old default rather than printing nothing.
    expect(frame({ streaming: 'x', currentTool: { name: 't' } })).toContain('running');
  });

  it('control: no tool means no card, so the assertions above are not vacuous', () => {
    const painted = frame({ streaming: 'nur Text', status: 'streaming' });
    expect(painted).not.toContain('Tool Invocation');
  });
});

describe('the diff card is visible while text is streaming', () => {
  it('shows the workspace mutation card during a stream', () => {
    const painted = frame({ streaming: 'schreibe Datei', status: 'diff_apply' });
    expect(painted).toContain('Applying Diff');
  });

  it('control: another status shows no diff card', () => {
    expect(frame({ streaming: 'x', status: 'streaming' })).not.toContain('Applying Diff');
  });
});

describe('the live block still disappears when nothing is running', () => {
  it('control: not busy means no spinner, no cards', () => {
    // Without this, hoisting the cards out of the branch could have moved them
    // out of the busy guard as well, so they would show for ever.
    const painted = frame({ busy: false, streaming: '', currentTool: { name: 'read_file' } });
    expect(painted).not.toContain('Tool Invocation');
    expect(painted).not.toContain('Thinking');
  });
});
