import type { ChatRequest, ProviderName } from '../types.js';
import type { RateLimiter } from '../rate-limiter.js';
import type { PlatformOperatorContext } from '../platform-auth.js';
import type { StateStore } from '../storage.js';

/** Observable permission category checked before every tool invocation. */
export type SkillEffect = 'read' | 'write' | 'network' | 'execute';

/** JSON Schema subset used to describe and validate executable tool inputs. */
export interface SkillSchema {
  type: 'object';
  properties: Record<string, {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
    description?: string;
    enum?: readonly (string | number | boolean)[];
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    items?: { type: 'string' };
    maxItems?: number;
  }>;
  required?: readonly string[];
  additionalProperties: false;
}

/** Trusted execution bindings supplied by the host, never by model arguments. */
export interface SkillExecutionContext {
  operator: PlatformOperatorContext;
  workspace?: { id: string; root: string; repository?: string };
  signal: AbortSignal;
  store: StateStore;
  /** Routes model calls through the host's authorization, limits and accounting. */
  executeModel?: (request: ChatRequest) => Promise<string>;
  /** Resolve only available catalog models; explicit models must belong to the requested provider. */
  resolveModel?: (provider: ProviderName, model?: string) => Promise<string>;
  /** Host-owned admission limits shared by every split/execution request. */
  rateLimiter?: RateLimiter;
  /** Rechecks current host policy; direct embedders must provide this callback. */
  authorize: (effect: SkillEffect, details?: Record<string, unknown>) => void | Promise<void>;
  /** Server-only credential resolver for the fixed GitHub API origin. */
  githubToken?: () => string | undefined;
}

/** Executable tool contract, separate from versioned prompt/skill catalog entries. */
export interface SkillDefinition {
  name: string;
  description: string;
  schema: SkillSchema;
  effect: SkillEffect | ((input: Record<string, unknown>) => SkillEffect);
  execute(input: Record<string, unknown>, context: SkillExecutionContext): Promise<unknown>;
}

/** Input or policy failure with an HTTP-safe status. */
export class SkillError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'SkillError'; }
}

/** Validate bounded JSON arguments before a tool can observe them. */
export function validateSkillInput(schema: SkillSchema, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkillError('Tool arguments must be an object');
  if (Buffer.byteLength(JSON.stringify(value)) > 128 * 1024) throw new SkillError('Tool arguments exceed 128 KiB', 413);
  const input = value as Record<string, unknown>;
  for (const required of schema.required ?? []) if (!Object.hasOwn(input, required)) throw new SkillError(`Missing tool argument: ${required}`);
  for (const [key, field] of Object.entries(input)) {
    if (!Object.hasOwn(schema.properties, key)) throw new SkillError(`Unknown tool argument: ${key}`);
    const spec = schema.properties[key];
    if (spec.type === 'array' ? !Array.isArray(field) : spec.type === 'integer' ? !Number.isSafeInteger(field) : spec.type === 'object' ? !field || typeof field !== 'object' || Array.isArray(field) : spec.type ? typeof field !== spec.type : false) throw new SkillError(`Invalid tool argument type: ${key}`);
    if (spec.enum && !spec.enum.includes(field as string)) throw new SkillError(`Invalid tool argument option: ${key}`);
    if (typeof field === 'string' && spec.maxLength !== undefined && field.length > spec.maxLength) throw new SkillError(`Tool argument is too long: ${key}`);
    if (typeof field === 'number' && (!Number.isFinite(field) || (spec.minimum !== undefined && field < spec.minimum) || (spec.maximum !== undefined && field > spec.maximum))) throw new SkillError(`Tool argument is outside its range: ${key}`);
    if (Array.isArray(field) && ((spec.maxItems !== undefined && field.length > spec.maxItems) || (spec.items?.type === 'string' && field.some(item => typeof item !== 'string')))) throw new SkillError(`Invalid tool argument array: ${key}`);
  }
  return structuredClone(input);
}

/** Registry that enforces argument validation and host policy before execution. */
export class SkillRegistry {
  private readonly definitions = new Map<string, SkillDefinition>();

  constructor(definitions: readonly SkillDefinition[] = []) { for (const definition of definitions) this.register(definition); }

  /** Register one uniquely named executable tool. */
  register(definition: SkillDefinition): void {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.name) || this.definitions.has(definition.name)) throw new SkillError('Invalid or duplicate tool name');
    this.definitions.set(definition.name, { ...definition, schema: structuredClone(definition.schema) });
  }

  /** Return public descriptors without executable functions or credentials. */
  list(): Array<Pick<SkillDefinition, 'name' | 'description' | 'schema'> & { effect: SkillEffect | 'depends-on-action' }> {
    return [...this.definitions.values()].map(({ name, description, schema, effect }) => ({ name, description, schema: structuredClone(schema), effect: typeof effect === 'function' ? 'depends-on-action' : effect }));
  }

  /** Invoke a tool with immutable argument data and freshly authorized context. */
  async execute(name: string, input: unknown, context: SkillExecutionContext): Promise<unknown> {
    const definition = this.definitions.get(name);
    if (!definition) throw new SkillError('Executable tool not found', 404);
    const parsed = validateSkillInput(definition.schema, input);
    context.signal.throwIfAborted();
    const effect = typeof definition.effect === 'function' ? definition.effect(parsed) : definition.effect;
    await context.authorize(effect, { skill: name });
    context.signal.throwIfAborted();
    return definition.execute(parsed, context);
  }
}
