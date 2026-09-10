import { describe, expect, it } from 'vitest';
import { renderTuiLines, type TuiMessage, type TuiState } from '../src/tui-render.js';
import { visibleWidth } from '../src/tui-layout.js';

/**
 * A frame used to cost time proportional to the WHOLE session, because every
 * message was wrapped and then all but the visible window was discarded.
 * Measured at 120x40: 0.32 ms at 10 messages, 1.05 at 60, 2.99 at 200, 8.46 at
 * 600, 26.1 at 1500. Past roughly 900 messages one frame no longer fits the
 * 16 ms budget, and every keystroke paints a frame.
 *
 * These assertions are about SHAPE, not wall-clock: a timing threshold on a
 * shared CI runner is a flaky test waiting to happen. What is asserted is that
 * repainting an unchanged transcript does no wrapping work, and that the amount
 * of work scales with what changed rather than with the history.
 */

function messages(count: number): TuiMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    // Long enough to need wrapping, so a cache miss is measurable.
    content: `Nachricht ${i}: ${'Wort '.repeat(40)}`,
    model: 'cli-codex/first',
  }));
}

function state(msgs: TuiMessage[]): TuiState {
  return {
    view: 'chat', overlay: 'none', model: 'cli-codex/first',
    sessionId: 's', sessionTitle: 'CLI chat', messages: msgs,
    input: '', cursor: 0, filter: '', selected: 0,
    models: [{ id: 'cli-codex/first' }], sessions: [], runs: [], workspaces: [],
    git: { detected: true, branch: 'main', files: 0, name: 'conduit-bridge' },
    host: '127.0.0.1:31338', notice: '', busy: false, streaming: '',
    width: 120, height: 40,
  } as unknown as TuiState;
}

/**
 * A transcript whose content reads can be counted.
 *
 * The cache is keyed on the message object, so the proxies must be created ONCE
 * and reused. Building fresh proxies per measurement makes every run a cache
 * miss, which is how the first version of this file managed to measure a
 * saving of zero against a cache that was working perfectly.
 */
function watched(count: number): { msgs: TuiMessage[]; reads: () => number; reset: () => void } {
  let reads = 0;
  const msgs = messages(count).map(m => new Proxy(m as object, {
    get(target, prop, recv) {
      if (prop === 'content') reads += 1;
      return Reflect.get(target, prop, recv);
    },
  }) as TuiMessage);
  return { msgs, reads: () => reads, reset: () => { reads = 0; } };
}

/** Content reads caused by painting `frames` frames of the same transcript. */
function cost(w: ReturnType<typeof watched>, frames: number): number {
  w.reset();
  for (let i = 0; i < frames; i += 1) renderTuiLines(state(w.msgs));
  return w.reads();
}

describe('frame cost follows what changed, not the length of the session', () => {
  // Measured on the real renderer: a cold frame reads `content` three times per
  // message, a warm one twice. The missing read is the wrap itself, so the
  // difference between cold and warm is exactly one per message. That is an
  // exact signal, unlike a wall-clock threshold, which on a shared runner is a
  // flaky test waiting to happen.
  const N = 200;

  it('saves exactly one wrap per message once the transcript is unchanged', () => {
    const w = watched(N);
    const cold = cost(w, 1);
    const warm = cost(w, 1);
    expect(cold - warm).toBe(N);
  });

  it('does not re-wrap once per frame, however many frames are painted', () => {
    const w = watched(N);
    const cold = cost(w, 1);
    const warm = cost(w, 1);
    // Ten further frames are all warm. Without the cache each would cost a cold
    // frame, so this is the difference between 10 x cold and 10 x warm.
    expect(cost(w, 10)).toBe(warm * 10);
    expect(warm * 10).toBeLessThan(cold * 10);
  });

  it('keeps the per-message cost flat as the history grows', () => {
    const short = watched(50);
    const long = watched(800);
    cost(short, 1);
    cost(long, 1);
    // A sixteenfold history must not raise what one message costs per frame.
    expect(cost(long, 1) / 800).toBe(cost(short, 1) / 50);
  });

  it('control: changing a message content does produce a new wrap', () => {
    // Without this, a cache that never invalidates would pass everything above
    // while freezing a streamed answer mid-sentence.
    const msgs = messages(3);
    const before = renderTuiLines(state(msgs)).lines.join('\n');
    msgs[1] = { ...msgs[1], content: 'vollstaendig andere Antwort hier entlang' };
    const after = renderTuiLines(state(msgs)).lines.join('\n');
    expect(after).not.toBe(before);
    expect(after).toContain('vollstaendig andere Antwort');
  });

  it('control: a frame at a given width does not depend on what was rendered before', () => {
    // Three earlier versions of this assertion were blind, each time because a
    // SYMPTOM was chosen instead of the property. Comparing whole frames passes
    // because borders differ with width anyway. Asserting that no line exceeds
    // the width passes because clampBox clips at the end regardless. Asserting
    // that a trailing marker survives passes because the marker lands on a
    // short continuation line that clipping never reaches.
    //
    // So assert the property itself: rendering at width W must produce the same
    // frame whether or not another width was rendered first. A cache that
    // ignores width cannot satisfy that, and no symptom has to be guessed.
    const fresh = renderTuiLines({ ...state(messages(4)), width: 80 } as TuiState).lines;

    const reused = messages(4);
    renderTuiLines({ ...state(reused), width: 140 } as TuiState);
    const after = renderTuiLines({ ...state(reused), width: 80 } as TuiState).lines;

    expect(after).toEqual(fresh);
  });

  it('control: a changed model re-renders the meta, rather than showing the old one', () => {
    // Same object, same content, different meta. A cache that only compares
    // identity and content keeps displaying the previous model for ever.
    const msgs = messages(2);
    const target = msgs[1] as { model: string };
    target.model = 'cli-codex/erstes-modell';
    const before = renderTuiLines(state(msgs)).lines.join('\n');
    expect(before).toContain('erstes-modell');
    target.model = 'cli-claude/zweites-modell';
    const after = renderTuiLines(state(msgs)).lines.join('\n');
    expect(after).toContain('zweites-modell');
    expect(after).not.toContain('erstes-modell');
  });

  it('control: a message mutated in place, as a stream does, is not frozen', () => {
    // The streamed message object is the SAME reference while it grows, so a
    // cache keyed only on identity would show the first chunk forever.
    const msgs = messages(2);
    const growing = msgs[1] as { content: string };
    growing.content = 'erster Teil';
    const first = renderTuiLines(state(msgs)).lines.join('\n');
    growing.content = 'erster Teil und der zweite Teil kam nach';
    const second = renderTuiLines(state(msgs)).lines.join('\n');
    expect(second).not.toBe(first);
    expect(second).toContain('zweite Teil');
  });
});
