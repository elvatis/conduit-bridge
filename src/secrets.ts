import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  linkSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { SecretReference, SecurityStorageConfig } from './types.js';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_SECRET_BYTES = 1024 * 1024;
const MAX_VAULT_BYTES = 16 * 1024 * 1024;
// A 32 MiB platform snapshot expands to roughly 43 MiB in base64url form.
const MAX_CIPHERTEXT_CHARS = 64 * 1024 * 1024;
const DEFAULT_KEY_ENV = 'CONDUIT_VAULT_KEY';
const DEFAULT_KEY_ID = 'default';
const VAULT_AAD = 'credential-vault';

export class SecureStorageUnavailableError extends Error {
  readonly code = 'SECURE_STORAGE_UNAVAILABLE';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SecureStorageUnavailableError';
  }
}

export interface ContentCipher {
  /** Authenticated encryption. The returned string is safe to persist. */
  seal(plaintext: string, context?: string): string;
  /** Authenticate and decrypt a value previously returned by seal. */
  open(sealed: string, context?: string): string;
}

export interface SecretCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type SecretCommandRunner = (
  command: string,
  args: string[],
  input?: string,
) => SecretCommandResult;

export interface ContentCipherOptions {
  /** Separates ciphertext domains such as platform-state and credentials. */
  purpose: string;
  /** Runtime directory for the DPAPI-wrapped key file and encrypted vault. */
  directory?: string;
  /** Name of an environment variable containing a 32-byte base64/hex key. */
  keyEnvironmentVariable?: string;
  /** Secret Service account and DPAPI key-file namespace. */
  keyId?: string;
  /** Test/embedding overrides. */
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  commandRunner?: SecretCommandRunner;
}

export interface SecretVaultOptions extends Omit<ContentCipherOptions, 'purpose'> {
  cipher?: ContentCipher;
  file?: string;
}

interface VaultDocument {
  version: 1;
  sealed: string;
}

interface VaultEntry {
  value: string;
  updatedAt: number;
}

interface VaultPayload {
  version: 1;
  entries: Record<string, VaultEntry>;
}

function defaultRuntimeDirectory(): string {
  return resolve(process.env.CONDUIT_HOME || join(homedir(), '.conduit'));
}

function validatePurpose(purpose: string): string {
  const value = purpose.trim();
  if (!value || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new Error('cipher purpose must be 1-128 safe identifier characters');
  }
  return value;
}

function validateKeyId(keyId: string): string {
  const value = keyId.trim();
  if (!value || value.length > 128 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error('vault key id must be 1-128 safe identifier characters');
  }
  return value;
}

function validateEnvironmentName(name: string): string {
  const value = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error('vault key environment variable name is invalid');
  }
  return value;
}

/** Parse only an explicit 256-bit key. Passphrases are deliberately unsupported. */
export function parseMasterKey(encoded: string): Buffer {
  const value = encoded.trim();
  let key: Buffer;
  if (value.startsWith('hex:')) {
    const body = value.slice(4);
    if (!/^[0-9a-fA-F]{64}$/.test(body)) throw new Error('hex vault key must contain exactly 64 hex characters');
    key = Buffer.from(body, 'hex');
  } else {
    const body = value.startsWith('base64:') ? value.slice(7) : value;
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(body)) throw new Error('vault key must be base64 or prefixed hex');
    key = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }
  if (key.length !== KEY_BYTES) throw new Error('vault key must decode to exactly 32 bytes');
  return key;
}

function runSecretCommand(command: string, args: string[], input?: string): SecretCommandResult {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function commandFailure(result: SecretCommandResult): string {
  if (result.error?.message) return result.error.message;
  const line = result.stderr.trim().split(/\r?\n/, 1)[0];
  return line || `process exited ${result.status ?? 'without a status'}`;
}

function atomicWrite(file: string, content: string, mode = 0o600): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx', mode });
    chmodSync(temp, mode);
    renameSync(temp, file);
    chmodSync(file, mode);
  } finally {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* best effort */ }
  }
}

/** Atomically publish a new file without replacing another process's winner. */
function atomicCreate(file: string, content: string, mode = 0o600): boolean {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, content, { encoding: 'utf8', flag: 'wx', mode, flush: true });
    chmodSync(temp, mode);
    try {
      linkSync(temp, file);
      chmodSync(file, mode);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
  } finally {
    try { if (existsSync(temp)) unlinkSync(temp); } catch { /* best effort */ }
  }
}

const DPAPI_PROTECT = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Security',
  '$raw = [Console]::In.ReadToEnd().Trim()',
  '$bytes = [Convert]::FromBase64String($raw)',
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser',
  '$out = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)',
  '[Console]::Out.Write([Convert]::ToBase64String($out))',
].join('; ');

const DPAPI_UNPROTECT = [
  '$ErrorActionPreference = "Stop"',
  'Add-Type -AssemblyName System.Security',
  '$raw = [Console]::In.ReadToEnd().Trim()',
  '$bytes = [Convert]::FromBase64String($raw)',
  '$scope = [Security.Cryptography.DataProtectionScope]::CurrentUser',
  '$out = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, $scope)',
  '[Console]::Out.Write([Convert]::ToBase64String($out))',
].join('; ');

function runPowerShell(runner: SecretCommandRunner, script: string, input: string): SecretCommandResult {
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script];
  const windowsPowerShell = runner('powershell.exe', args, input);
  if (!windowsPowerShell.error) return windowsPowerShell;
  return runner('pwsh', args, input);
}

function dpapiMasterKey(directory: string, keyId: string, runner: SecretCommandRunner): Buffer {
  const file = join(directory, `vault-key-${keyId}.dpapi`);
  if (existsSync(file)) {
    const wrapped = readFileSync(file, 'utf8').trim();
    if (!wrapped || statSync(file).size > 64 * 1024) {
      throw new SecureStorageUnavailableError('The DPAPI vault key file is empty or invalid.');
    }
    const result = runPowerShell(runner, DPAPI_UNPROTECT, wrapped);
    if (result.status !== 0) {
      throw new SecureStorageUnavailableError(`Windows DPAPI could not unlock the vault key: ${commandFailure(result)}`);
    }
    try { return parseMasterKey(result.stdout); }
    catch (cause) { throw new SecureStorageUnavailableError('Windows DPAPI returned an invalid vault key.', { cause }); }
  }

  const key = randomBytes(KEY_BYTES);
  const result = runPowerShell(runner, DPAPI_PROTECT, key.toString('base64'));
  if (result.status !== 0 || !result.stdout.trim()) {
    key.fill(0);
    throw new SecureStorageUnavailableError(`Windows DPAPI could not protect a vault key: ${commandFailure(result)}`);
  }
  if (atomicCreate(file, result.stdout.trim())) return key;
  // Another process initialized the key first. Its DPAPI blob is authoritative.
  key.fill(0);
  return dpapiMasterKey(directory, keyId, runner);
}

function secretServiceMasterKey(keyId: string, runner: SecretCommandRunner): Buffer {
  const attrs = ['service', 'conduit-bridge', 'vault', keyId];
  const lookup = runner('secret-tool', ['lookup', ...attrs]);
  if (lookup.status === 0 && lookup.stdout.trim()) {
    try { return parseMasterKey(lookup.stdout); }
    catch (cause) { throw new SecureStorageUnavailableError('Linux Secret Service returned an invalid vault key.', { cause }); }
  }
  if (lookup.error) {
    throw new SecureStorageUnavailableError(
      `Linux Secret Service is unavailable (${commandFailure(lookup)}). Set an explicit 32-byte vault key environment variable for a headless host.`,
    );
  }

  const key = randomBytes(KEY_BYTES);
  const store = runner(
    'secret-tool',
    ['store', '--label=Conduit Bridge vault key', ...attrs],
    key.toString('base64'),
  );
  if (store.status !== 0) {
    key.fill(0);
    throw new SecureStorageUnavailableError(
      `Linux Secret Service could not store the vault key (${commandFailure(store)}). Set an explicit 32-byte vault key environment variable for a headless host.`,
    );
  }
  return key;
}

function loadMasterKey(options: ContentCipherOptions): Buffer {
  const env = options.env ?? process.env;
  const envName = validateEnvironmentName(options.keyEnvironmentVariable || DEFAULT_KEY_ENV);
  const supplied = env[envName];
  if (supplied) {
    try { return parseMasterKey(supplied); }
    catch (cause) {
      throw new SecureStorageUnavailableError(`${envName} does not contain a valid 32-byte key.`, { cause });
    }
  }

  const platform = options.platform ?? process.platform;
  const directory = resolve(options.directory || defaultRuntimeDirectory());
  const keyId = validateKeyId(options.keyId || DEFAULT_KEY_ID);
  const runner = options.commandRunner ?? runSecretCommand;
  if (platform === 'win32') return dpapiMasterKey(directory, keyId, runner);
  if (platform === 'linux') return secretServiceMasterKey(keyId, runner);
  throw new SecureStorageUnavailableError(
    `Secure vault keys are not supported on ${platform}. Supply ${envName} with an explicit 32-byte key.`,
  );
}

class AesGcmContentCipher implements ContentCipher {
  constructor(private readonly key: Buffer, private readonly purpose: string) {}

  private aad(context?: string): Buffer {
    return Buffer.from(`conduit-bridge:v1:${this.purpose}:${context || ''}`, 'utf8');
  }

  seal(plaintext: string, context?: string): string {
    if (typeof plaintext !== 'string') throw new TypeError('plaintext must be a string');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(this.aad(context));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['cb1', iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join('.');
  }

  open(sealed: string, context?: string): string {
    if (typeof sealed !== 'string' || sealed.length > MAX_CIPHERTEXT_CHARS) throw new Error('encrypted content is invalid');
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== 'cb1') throw new Error('unsupported encrypted content format');
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('encrypted content is malformed');
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
      decipher.setAAD(this.aad(context));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (cause) {
      throw new Error('encrypted content failed authentication', { cause });
    }
  }
}

/** Create a purpose-bound, synchronous authenticated content cipher. */
export function createContentCipher(options: ContentCipherOptions): ContentCipher {
  const purpose = validatePurpose(options.purpose);
  const master = loadMasterKey(options);
  try {
    const derived = Buffer.from(hkdfSync(
      'sha256',
      master,
      Buffer.from('conduit-bridge-content-v1', 'utf8'),
      Buffer.from(purpose, 'utf8'),
      KEY_BYTES,
    ));
    return new AesGcmContentCipher(derived, purpose);
  } finally {
    master.fill(0);
  }
}

export function isSecretReference(value: unknown): value is SecretReference {
  return typeof value === 'string' && /^vault:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function referenceId(ref: SecretReference): string {
  if (!isSecretReference(ref)) throw new Error('secret reference is invalid');
  return ref.slice('vault:v1:'.length);
}

export class EncryptedFileSecretVault {
  private _cipher?: ContentCipher;

  constructor(private readonly options: SecretVaultOptions = {}) {}

  private get file(): string {
    return resolve(this.options.file || join(this.options.directory || defaultRuntimeDirectory(), 'secrets.vault'));
  }

  private get cipher(): ContentCipher {
    this._cipher ??= this.options.cipher ?? createContentCipher({
      purpose: VAULT_AAD,
      directory: this.options.directory,
      keyEnvironmentVariable: this.options.keyEnvironmentVariable,
      keyId: this.options.keyId,
      platform: this.options.platform,
      env: this.options.env,
      commandRunner: this.options.commandRunner,
    });
    return this._cipher;
  }

  private read(): VaultPayload {
    if (!existsSync(this.file)) return { version: 1, entries: {} };
    if (statSync(this.file).size > MAX_VAULT_BYTES) throw new Error('encrypted secret vault exceeds its size limit');
    const raw = readFileSync(this.file, 'utf8');
    let doc: VaultDocument;
    try { doc = JSON.parse(raw) as VaultDocument; }
    catch (cause) { throw new Error('encrypted secret vault is not valid JSON', { cause }); }
    if (doc.version !== 1 || typeof doc.sealed !== 'string') throw new Error('encrypted secret vault has an unsupported format');
    let payload: VaultPayload;
    try { payload = JSON.parse(this.cipher.open(doc.sealed, VAULT_AAD)) as VaultPayload; }
    catch (cause) {
      // Keep OS/key-provider outages typed so HTTP callers can return a useful
      // service-unavailable response. Authentication/format failures remain a
      // generic vault-open error and never expose ciphertext or key material.
      if (cause instanceof SecureStorageUnavailableError) throw cause;
      throw new Error('encrypted secret vault could not be opened', { cause });
    }
    if (payload.version !== 1 || !payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) {
      throw new Error('encrypted secret vault payload is invalid');
    }
    for (const [id, entry] of Object.entries(payload.entries)) {
      if (!isSecretReference(`vault:v1:${id}`) || typeof entry?.value !== 'string' || !Number.isFinite(entry?.updatedAt)) {
        throw new Error('encrypted secret vault contains an invalid entry');
      }
    }
    return payload;
  }

  private write(payload: VaultPayload): void {
    const plaintext = JSON.stringify(payload);
    if (Buffer.byteLength(plaintext) > MAX_VAULT_BYTES) throw new Error('encrypted secret vault exceeds its size limit');
    const doc: VaultDocument = { version: 1, sealed: this.cipher.seal(plaintext, VAULT_AAD) };
    atomicWrite(this.file, JSON.stringify(doc));
  }

  put(value: string, existingRef?: SecretReference): SecretReference {
    if (typeof value !== 'string' || !value.trim()) throw new Error('secret value must not be empty');
    if (Buffer.byteLength(value) > MAX_SECRET_BYTES) throw new Error('secret value exceeds the 1 MiB limit');
    const payload = this.read();
    const id = existingRef ? referenceId(existingRef) : randomUUID();
    payload.entries[id] = { value, updatedAt: Date.now() };
    this.write(payload);
    return `vault:v1:${id}`;
  }

  get(ref: SecretReference): string | undefined {
    return this.read().entries[referenceId(ref)]?.value;
  }

  has(ref: SecretReference): boolean {
    return this.get(ref) !== undefined;
  }

  delete(ref: SecretReference): boolean {
    const payload = this.read();
    const id = referenceId(ref);
    if (!Object.hasOwn(payload.entries, id)) return false;
    delete payload.entries[id];
    this.write(payload);
    return true;
  }
}

export function openSecretVault(options: SecretVaultOptions = {}): EncryptedFileSecretVault {
  return new EncryptedFileSecretVault(options);
}

/** Convert persisted security settings to cipher/vault constructor options. */
export function secretStorageOptions(
  config: SecurityStorageConfig | undefined,
  directory?: string,
): Omit<ContentCipherOptions, 'purpose'> {
  return {
    directory,
    keyEnvironmentVariable: config?.vaultKeyEnvironmentVariable,
    keyId: config?.vaultKeyId,
  };
}
