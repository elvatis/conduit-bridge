import { randomUUID } from 'node:crypto';
import type { StateStore } from './storage.js';
import type { ProviderName, SecretReference } from './types.js';

const COLLECTION = 'platform.profiles';
const PROVIDERS: ProviderName[] = ['claude-api', 'gemini-api', 'codex-api', 'openrouter-api', 'perplexity-api', 'lmstudio', 'cli-claude', 'cli-codex', 'cli-gemini', 'cli-grok'];
export interface PlatformProviderProfile {
  id: string;
  revision: number;
  name: string;
  provider: ProviderName;
  model?: string;
  credentialRef?: SecretReference;
  cliExecutable?: string;
  enabled: boolean;
  defaultEffort?: string;
  maxConcurrent: number;
  cooldownMs: number;
  createdAt: number;
  updatedAt: number;
}
export interface ProfileInput {
  id?: string;
  expectedRevision?: number;
  name: string;
  provider: ProviderName;
  model?: string;
  credentialRef?: SecretReference;
  cliExecutable?: string;
  enabled?: boolean;
  defaultEffort?: string;
  maxConcurrent?: number;
  cooldownMs?: number;
}
export class ProfileError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export class PlatformProfileService {
  private active = new Map<string, number>();
  private cooldown = new Map<string, number>();
  /** Blocks new acquisitions while a profile mutation is crossing an async storage boundary. */
  private mutating = new Set<string>();
  constructor(private store: StateStore) {}
  list(): PlatformProviderProfile[] { return this.store.list<PlatformProviderProfile>(COLLECTION).sort((a, b) => a.name.localeCompare(b.name)); }
  get(id: string): PlatformProviderProfile | undefined { return this.store.read<PlatformProviderProfile>(COLLECTION, id); }
  async save(input: ProfileInput): Promise<PlatformProviderProfile> {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new ProfileError('Profile name is required and must be at most 120 characters');
    if (!PROVIDERS.includes(input.provider)) throw new ProfileError('Unknown provider');
    if (input.model !== undefined && (typeof input.model !== 'string' || input.model.length > 200)) throw new ProfileError('Invalid model');
    if (input.cliExecutable !== undefined && (typeof input.cliExecutable !== 'string' || input.cliExecutable.length > 1000 || input.cliExecutable.includes('\0'))) throw new ProfileError('Invalid CLI executable');
    const maximum = input.maxConcurrent ?? 2; const cooldown = input.cooldownMs ?? 5000;
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 16) throw new ProfileError('maxConcurrent must be between 1 and 16');
    if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 600000) throw new ProfileError('cooldownMs must be between 0 and 600000');
    if (input.defaultEffort !== undefined && !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(input.defaultEffort)) throw new ProfileError('Invalid default effort');
    const id = input.id ?? `profile-${randomUUID()}`;
    if (this.mutating.has(id)) throw new ProfileError('Profile is already being changed', 409);
    this.mutating.add(id);
    try {
      if ((this.active.get(id) ?? 0) > 0) throw new ProfileError('Profile has active requests', 409);
      return await this.store.transaction(tx => {
        const prior = tx.read<PlatformProviderProfile>(COLLECTION, id);
        if (prior && input.expectedRevision !== prior.revision) throw new ProfileError('Profile changed; reload before saving', 409);
        if (prior?.provider !== input.provider && prior?.credentialRef && input.credentialRef === prior.credentialRef) {
          throw new ProfileError('Clear or replace the stored credential when changing profile provider', 409);
        }
        const value: PlatformProviderProfile = {
          id, revision: (prior?.revision ?? 0) + 1, name: input.name.trim(), provider: input.provider,
          model: input.model, credentialRef: input.credentialRef, cliExecutable: input.cliExecutable,
          enabled: input.enabled !== false, defaultEffort: input.defaultEffort, maxConcurrent: maximum,
          cooldownMs: cooldown, createdAt: prior?.createdAt ?? Date.now(), updatedAt: Date.now(),
        };
        tx.put(COLLECTION, id, value); return value;
      });
    } finally { this.mutating.delete(id); }
  }
  async delete(id: string): Promise<void> {
    if (this.mutating.has(id)) throw new ProfileError('Profile is already being changed', 409);
    this.mutating.add(id);
    try {
      if ((this.active.get(id) ?? 0) > 0) throw new ProfileError('Profile has active requests', 409);
      await this.store.transaction(tx => { if (!tx.delete(COLLECTION, id)) throw new ProfileError('Profile not found', 404); });
    } finally { this.mutating.delete(id); }
  }
  acquire(id: string): (error?: unknown) => void {
    if (this.mutating.has(id)) throw new ProfileError('Profile is being changed', 409);
    const profile = this.get(id);
    if (!profile) throw new ProfileError('Profile not found', 404);
    if (!profile.enabled) throw new ProfileError('Profile is disabled', 403);
    if ((this.cooldown.get(id) ?? 0) > Date.now()) throw new ProfileError('Profile is cooling down after a provider failure', 429);
    const active = this.active.get(id) ?? 0;
    if (active >= profile.maxConcurrent) throw new ProfileError('Profile concurrency limit reached', 429);
    this.active.set(id, active + 1);
    let released = false;
    return error => {
      if (released) return; released = true;
      this.active.set(id, Math.max(0, (this.active.get(id) ?? 1) - 1));
      if (error) this.cooldown.set(id, Date.now() + profile.cooldownMs);
    };
  }
  status(id: string): { active: number; cooldownUntil: number | null } { return { active: this.active.get(id) ?? 0, cooldownUntil: (this.cooldown.get(id) ?? 0) > Date.now() ? this.cooldown.get(id)! : null }; }
}
