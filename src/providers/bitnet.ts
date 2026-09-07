import type { BridgeConfig, ModelDefinition } from '../types.js';
import { LmStudioProvider } from './lmstudio.js';

/** BitNet's llama-server transport. Installation and model loading are explicit administrator operations. */
export class BitNetProvider extends LmStudioProvider {
  constructor(cfg: BridgeConfig) { super(cfg, { name: 'bitnet', prefix: 'bitnet/', defaultUrl: 'http://127.0.0.1:8080', environment: 'BITNET_URL', label: 'BitNet' }); }
  /** Compatibility aliases describe requested models, not proof they are installed or chat-capable. */
  override get models(): ModelDefinition[] {
    const discovered = super.models;
    return [...discovered, ...['2B-4T', 'embedding-0.6B', 'embedding-270M'].filter(id => !discovered.some(model => model.id === `bitnet/${id}`)).map(id => ({ id: `bitnet/${id}`, provider: 'bitnet' as const, displayName: `BitNet ${id} (requires loaded compatible model)`, owned_by: 'bitnet', availability: 'dynamic' as const }))];
  }
  override async login(): Promise<void> { throw new Error('Start the BitNet inference server; no provider login is required'); }
  override async logout(): Promise<void> { /* Local provider has no credentials to revoke. */ }
}
