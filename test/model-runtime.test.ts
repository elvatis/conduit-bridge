import { describe, it, expect } from 'vitest';
import { createModelDescriptor, ProviderRuntime } from '../src/model-runtime.js';
import type { ModelDefinition } from '../src/types.js';
import type { PlatformSession } from '../src/platform-content.js';

describe('ModelDescriptor and ProviderRuntime', () => {
  const claudeModel: ModelDefinition = {
    id: 'cli-claude/claude-3-5-sonnet',
    provider: 'cli-claude',
    displayName: 'Claude 3.5 Sonnet',
    owned_by: 'claude',
    contextWindow: 200000,
  };

  const codexModel: ModelDefinition = {
    id: 'cli-codex/gpt-5-turbo',
    provider: 'cli-codex',
    displayName: 'GPT-5 Turbo',
    owned_by: 'codex',
    contextWindow: 128000,
  };

  const geminiApiModel: ModelDefinition = {
    id: 'gemini-api/gemini-2.5-pro',
    provider: 'gemini-api',
    displayName: 'Gemini 2.5 Pro',
    owned_by: 'google',
    contextWindow: 1000000,
  };

  const bitnetModel: ModelDefinition = {
    id: 'bitnet/bitnet-b1.58-2b',
    provider: 'bitnet',
    displayName: 'BitNet b1.58 2B',
    owned_by: 'microsoft',
    contextWindow: 4096,
  };

  it('creates model descriptor with rich capabilities and auth metadata', () => {
    const desc = createModelDescriptor(claudeModel);
    expect(desc.auth).toBe('cli');
    expect(desc.capabilities.modes).toEqual(['chat', 'plan', 'agent']);
    expect(desc.capabilities.nativeResume).toBe(true);
    expect(desc.capabilities.tools).toContain('bash');
    expect(desc.cost?.local).toBe(false);

    const localDesc = createModelDescriptor(bitnetModel);
    expect(localDesc.auth).toBe('local');
    expect(localDesc.cost?.local).toBe(true);
    expect(localDesc.local?.runtime).toBe('bitnet');
    expect(localDesc.capabilities.nativeResume).toBe(false);
  });

  it('evaluates swap plan preserving native resume within provider and resetting across providers', () => {
    const runtime = new ProviderRuntime();

    // Same provider
    const sameSwap = runtime.planSwap(claudeModel, { ...claudeModel, id: 'cli-claude/claude-3-opus' });
    expect(sameSwap.allowed).toBe(true);
    expect(sameSwap.nativeResumePreserved).toBe(true);

    // Cross provider
    const crossSwap = runtime.planSwap(claudeModel, codexModel, { currentBudget: 150000 });
    expect(crossSwap.allowed).toBe(true);
    expect(crossSwap.nativeResumePreserved).toBe(false);
    expect(crossSwap.contextAdjustment.dropOldTurns).toBe(true);
    expect(crossSwap.contextAdjustment.newBudget).toBe(128000);

    // Swap to API (drops tools)
    const apiSwap = runtime.planSwap(claudeModel, geminiApiModel, { requestedTools: ['bash', 'grep'] });
    expect(apiSwap.droppedTools).toEqual(['bash', 'grep']);
  });

  it('creates runtime session handle and converts SessionState bidirectionally without loss', () => {
    const runtime = new ProviderRuntime();
    const rtSession = runtime.createRuntimeSession({
      sessionId: 'sess-123',
      provider: 'cli-claude',
      modelId: 'cli-claude/claude-3-5-sonnet',
      cwd: 'C:\\workspace',
      mode: 'agent',
    });

    expect(rtSession.id).toMatch(/^rt-/);
    expect(rtSession.sessionId).toBe('sess-123');
    expect(rtSession.mode).toBe('agent');

    const platformSession: PlatformSession = {
      id: 'sess-123',
      title: 'Feature implementation',
      retention: 'retained',
      revision: 3,
      userId: 'op-1',
      workspaceId: 'ws-primary',
      createdAt: 1000,
      updatedAt: 2000,
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Add validation tests',
          provider: 'cli-claude',
          model: 'cli-claude/claude-3-5-sonnet',
          createdAt: 1100,
          status: 'complete',
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Tests added.',
          provider: 'cli-claude',
          model: 'cli-claude/claude-3-5-sonnet',
          createdAt: 1200,
          status: 'complete',
        },
      ],
      summary: {
        content: 'Conversation about tests',
        throughMessageId: 'msg-2',
        updatedAt: 1250,
      },
    };

    const sessionState = runtime.toSessionState(platformSession, {
      runtime: rtSession,
      permission: { mode: 'agent', disallowedTools: 'rm' },
      fallbackModels: ['cli-codex/gpt-5-turbo'],
    });

    expect(sessionState.id).toBe('sess-123');
    expect(sessionState.messages.length).toBe(2);
    expect(sessionState.runtime?.id).toBe(rtSession.id);
    expect(sessionState.permission.mode).toBe('agent');
    expect(sessionState.permission.disallowedTools).toBe('rm');
    expect(sessionState.fallbackModels).toEqual(['cli-codex/gpt-5-turbo']);

    const restored = runtime.fromSessionState(sessionState, platformSession);
    expect(restored.id).toBe('sess-123');
    expect(restored.messages?.length).toBe(2);
    expect((restored as any).runtime?.id).toBe(rtSession.id);
  });
});
