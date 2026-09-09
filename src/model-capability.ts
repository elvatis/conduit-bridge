import { effortCapabilities } from './effort.js';
import { supportsFastMode } from './fast-mode.js';
import type { ProviderCapability, ProviderName } from './types.js';

/** Capability contract derived from the transport and model id, not from a vendor catalog scrape. */
export function capabilitiesFor(provider: ProviderName, modelId: string): ProviderCapability {
  const cli = provider.startsWith('cli-');
  const local = provider === 'lmstudio' || provider === 'bitnet';
  return {
    modes: cli ? ['chat', 'plan', 'agent'] : ['chat'],
    effort: effortCapabilities(provider).values,
    fastMode: supportsFastMode(provider, modelId),
    streaming: cli ? 'turn' : 'token',
    nativeResume: cli,
    local,
  };
}
