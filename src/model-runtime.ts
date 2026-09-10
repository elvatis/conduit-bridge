import type { ModelDefinition, ModelDescriptor, ProviderCapability, ProviderName, RuntimeSession, SessionState } from './types.js';
import type { PlatformSession } from './platform-content.js';
import { capabilitiesFor } from './model-capability.js';
import { randomUUID } from 'node:crypto';

export interface SwapPlan {
  allowed: boolean;
  nativeResumePreserved: boolean;
  contextAdjustment: {
    oldBudget?: number;
    newBudget: number;
    dropOldTurns: boolean;
  };
  droppedTools: string[];
  reason?: string;
}

export function createModelDescriptor(model: ModelDefinition): ModelDescriptor {
  const provider = model.provider;
  const capabilities = model.capabilities ?? capabilitiesFor(provider, model.id);
  const isCli = provider.startsWith('cli-');
  const isLocal = provider === 'lmstudio' || provider === 'bitnet';
  const auth: ModelDescriptor['auth'] = isCli ? 'cli' : isLocal ? 'local' : 'api-key';

  return {
    ...model,
    capabilities,
    cost: {
      estimator: 'bridge-estimate-v2',
      local: isLocal,
    },
    auth,
    local: isLocal ? {
      runtime: provider as 'lmstudio' | 'bitnet',
      installed: true,
      loaded: true,
    } : undefined,
  };
}

export class ProviderRuntime {
  describe(model: ModelDefinition): ModelDescriptor {
    return createModelDescriptor(model);
  }

  planSwap(
    fromModel: ModelDefinition,
    toModel: ModelDefinition,
    options: { currentBudget?: number; profileId?: string; requestedTools?: string[] } = {}
  ): SwapPlan {
    const fromDesc = this.describe(fromModel);
    const toDesc = this.describe(toModel);

    // Native resume is only preserved when staying on the same provider with nativeResume enabled
    const sameProvider = fromDesc.provider === toDesc.provider;
    const nativeResumePreserved = sameProvider && Boolean(toDesc.capabilities.nativeResume);

    const oldBudget = options.currentBudget ?? fromDesc.contextWindow ?? 8192;
    const newWindow = toDesc.contextWindow ?? 8192;
    const maxPromptBudget = toDesc.maxPromptChars ? Math.floor(toDesc.maxPromptChars / 4) : newWindow;
    const newBudget = Math.min(oldBudget, newWindow, maxPromptBudget);
    const dropOldTurns = newBudget < oldBudget;

    const supportedTools = new Set(toDesc.capabilities.tools ?? []);
    const requestedTools = options.requestedTools ?? fromDesc.capabilities.tools ?? [];
    const droppedTools = requestedTools.filter(tool => !supportedTools.has(tool));

    return {
      allowed: true,
      nativeResumePreserved,
      contextAdjustment: {
        oldBudget,
        newBudget,
        dropOldTurns,
      },
      droppedTools,
      reason: nativeResumePreserved
        ? 'Native resume preserved within the same provider'
        : 'Provider switch starts a fresh runtime process while keeping the canonical transcript',
    };
  }

  createRuntimeSession(input: {
    sessionId?: string;
    provider: ProviderName;
    modelId: string;
    nativeSessionId?: string;
    cwd?: string;
    mode?: 'chat' | 'plan' | 'agent';
  }): RuntimeSession {
    const now = Date.now();
    return {
      id: `rt-${randomUUID()}`,
      sessionId: input.sessionId,
      adapter: input.provider,
      modelId: input.modelId,
      nativeSessionId: input.nativeSessionId,
      cwd: input.cwd,
      mode: input.mode ?? 'chat',
      startedAt: now,
      lastActiveAt: now,
    };
  }

  toSessionState(
    session: PlatformSession,
    options: {
      runtime?: RuntimeSession;
      permission?: { mode: string; disallowedTools?: string };
      fallbackModels?: string[];
    } = {}
  ): SessionState {
    const mode = options.permission?.mode ?? (session as any).permission?.mode ?? 'chat';
    const disallowedTools = options.permission?.disallowedTools ?? (session as any).permission?.disallowedTools;

    return {
      id: session.id,
      revision: session.revision,
      workspaceId: session.workspaceId,
      messages: session.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        provider: m.provider,
        model: m.model,
        createdAt: m.createdAt,
        nativeSessionId: m.nativeSessionId,
        status: m.status,
      })),
      summary: session.summary,
      memories: (session as any).memories ?? [],
      skills: (session as any).skills ?? [],
      agentId: session.agentId,
      profileId: session.profileId,
      taskId: (session as any).taskId,
      runtime: options.runtime ?? (session as any).runtime,
      permission: {
        mode,
        disallowedTools,
      },
      fallbackModels: options.fallbackModels ?? (session as any).fallbackModels ?? [],
      swapHistory: (session as any).swapHistory ?? [],
    };
  }

  fromSessionState(state: SessionState, baseSession?: PlatformSession): Partial<PlatformSession> {
    return {
      id: state.id,
      revision: state.revision,
      workspaceId: state.workspaceId,
      messages: state.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        provider: m.provider,
        model: m.model,
        createdAt: m.createdAt,
        nativeSessionId: m.nativeSessionId,
        status: m.status,
      })),
      summary: state.summary,
      agentId: state.agentId,
      profileId: state.profileId,
      ...(baseSession ?? {}),
      // Preserved runtime fields
      ...({
        taskId: state.taskId,
        runtime: state.runtime,
        permission: state.permission,
        fallbackModels: state.fallbackModels,
        swapHistory: state.swapHistory,
      } as any),
    };
  }
}
