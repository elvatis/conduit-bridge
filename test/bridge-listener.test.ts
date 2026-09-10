import { describe, expect, it } from 'vitest';
import { ensureBridgeListener } from '../src/bridge-listener.js';

describe('ensureBridgeListener', () => {
  it('returns attached when a listener is already ready', async () => {
    let spawned = 0;
    const result = await ensureBridgeListener({
      ready: async () => true,
      spawn: () => { spawned++; },
    });
    expect(result).toBe('attached');
    expect(spawned).toBe(0);
  });

  it('spawns a detached listener and waits until it is ready', async () => {
    let ready = false;
    let spawned = 0;
    const result = await ensureBridgeListener({
      ready: async () => ready,
      spawn: () => { spawned++; ready = true; },
      sleep: async () => {},
      attempts: 3,
      intervalMs: 0,
    });
    expect(result).toBe('spawned');
    expect(spawned).toBe(1);
  });
});
