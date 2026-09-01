export type OrchestrationStrategy = 'sequential' | 'parallel' | 'debate';

export interface OrchestrationRole {
  name: string;
  model: string;
}

export interface OrchestratorConfig {
  enabled: boolean;
  strategy: OrchestrationStrategy;
  roles: OrchestrationRole[];
  fallbackModels: string[];
}

export const DEFAULT_ORCHESTRATOR: OrchestratorConfig = {
  enabled: false,
  strategy: 'sequential',
  roles: [
    { name: 'Analyst', model: '' },
    { name: 'Reviewer', model: '' },
    { name: 'Synthesizer', model: '' },
  ],
  fallbackModels: [],
};
