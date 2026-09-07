import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SecureStorageUnavailableError,
  createContentCipher,
  isSecretReference,
  openSecretVault,
  parseMasterKey,
  type SecretCommandRunner,
} from '../src/secrets.js';

const KEY = Buffer.alloc(32, 0x42).toString('base64');

describe('ContentCipher', () => {
  it('round-trips content and uses a fresh nonce for every seal', () => {
    const cipher = createContentCipher({ purpose: 'platform-state', env: { CONDUIT_VAULT_KEY: KEY } });
    const first = cipher.seal('sensitive prompt');
    const second = cipher.seal('sensitive prompt');
    expect(first).not.toBe(second);
    expect(cipher.open(first)).toBe('sensitive prompt');
    expect(cipher.open(second)).toBe('sensitive prompt');
    expect(first).not.toContain('sensitive prompt');
  });

  it('authenticates ciphertext, purpose, and context', () => {
    const one = createContentCipher({ purpose: 'one', env: { CONDUIT_VAULT_KEY: KEY } });
    const two = createContentCipher({ purpose: 'two', env: { CONDUIT_VAULT_KEY: KEY } });
    const sealed = one.seal('value', 'record-1');
    expect(one.open(sealed, 'record-1')).toBe('value');
    expect(() => one.open(sealed, 'record-2')).toThrow(/authentication/i);
    expect(() => two.open(sealed, 'record-1')).toThrow(/authentication/i);
    const parts = sealed.split('.');
    const tag = Buffer.from(parts[3], 'base64url');
    tag[0] ^= 1;
    const tampered = [parts[0], parts[1], parts[2], tag.toString('base64url')].join('.');
    expect(() => one.open(tampered, 'record-1')).toThrow(/authentication/i);
  });

  it('requires an exact 256-bit environment key', () => {
    expect(parseMasterKey(`hex:${'ab'.repeat(32)}`)).toHaveLength(32);
    expect(() => parseMasterKey('base64:dG9vLXNob3J0')).toThrow(/32 bytes/i);
    expect(() => createContentCipher({ purpose: 'test', platform: 'freebsd', env: {} }))
      .toThrow(SecureStorageUnavailableError);
  });
});

describe('platform key adapters', () => {
  it.runIf(process.platform === 'win32')('round-trips through the real current-user DPAPI adapter', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conduit-real-dpapi-'));
    const cipher = createContentCipher({ purpose: 'state', platform: 'win32', env: {}, directory });
    const sealed = cipher.seal('dpapi-private');
    const reopened = createContentCipher({ purpose: 'state', platform: 'win32', env: {}, directory });
    expect(reopened.open(sealed)).toBe('dpapi-private');
  });

  it('uses a DPAPI-wrapped key file on Windows and never stores the raw key', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conduit-dpapi-'));
    let protectedRaw = '';
    const runner: SecretCommandRunner = (_command, _args, input) => {
      if (!protectedRaw) {
        const raw = Buffer.from(input || '', 'base64');
        expect(raw).toHaveLength(32);
        protectedRaw = Buffer.from(`wrapped:${input}`).toString('base64');
        return { status: 0, stdout: protectedRaw, stderr: '' };
      }
      const wrapped = Buffer.from(input || '', 'base64').toString('utf8');
      return { status: 0, stdout: wrapped.slice('wrapped:'.length), stderr: '' };
    };
    const first = createContentCipher({ purpose: 'state', platform: 'win32', env: {}, directory, commandRunner: runner });
    const sealed = first.seal('private');
    const keyFile = readFileSync(join(directory, 'vault-key-default.dpapi'), 'utf8');
    expect(keyFile).toBe(protectedRaw);
    expect(keyFile).not.toContain('private');
    const second = createContentCipher({ purpose: 'state', platform: 'win32', env: {}, directory, commandRunner: runner });
    expect(second.open(sealed)).toBe('private');
  });

  it('looks up and creates a Linux Secret Service key', () => {
    let stored = '';
    const runner: SecretCommandRunner = (command, args, input) => {
      expect(command).toBe('secret-tool');
      if (args[0] === 'lookup') return stored
        ? { status: 0, stdout: stored, stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
      stored = input || '';
      return { status: 0, stdout: '', stderr: '' };
    };
    const first = createContentCipher({ purpose: 'state', platform: 'linux', env: {}, commandRunner: runner });
    const sealed = first.seal('private');
    expect(parseMasterKey(stored)).toHaveLength(32);
    const second = createContentCipher({ purpose: 'state', platform: 'linux', env: {}, commandRunner: runner });
    expect(second.open(sealed)).toBe('private');
  });

  it('fails clearly when a headless Linux host has neither adapter nor env key', () => {
    const runner: SecretCommandRunner = () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('ENOENT'),
    });
    expect(() => createContentCipher({ purpose: 'state', platform: 'linux', env: {}, commandRunner: runner }))
      .toThrow(/headless host/i);
  });
});

describe('EncryptedFileSecretVault', () => {
  it('persists only authenticated ciphertext and supports stable references', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conduit-vault-'));
    const vault = openSecretVault({ directory, env: { CONDUIT_VAULT_KEY: KEY } });
    const ref = vault.put('provider-api-secret');
    expect(isSecretReference(ref)).toBe(true);
    expect(vault.get(ref)).toBe('provider-api-secret');
    const sameRef = vault.put('rotated-secret', ref);
    expect(sameRef).toBe(ref);
    expect(openSecretVault({ directory, env: { CONDUIT_VAULT_KEY: KEY } }).get(ref)).toBe('rotated-secret');
    const disk = readFileSync(join(directory, 'secrets.vault'), 'utf8');
    expect(disk).not.toContain('provider-api-secret');
    expect(disk).not.toContain('rotated-secret');
    expect(vault.delete(ref)).toBe(true);
    expect(vault.has(ref)).toBe(false);
  });

  it('does not initialize secure storage until durable vault access', () => {
    const directory = mkdtempSync(join(tmpdir(), 'conduit-vault-lazy-'));
    const vault = openSecretVault({ directory, platform: 'linux', env: {}, commandRunner: () => ({
      status: null, stdout: '', stderr: '', error: new Error('ENOENT'),
    }) });
    expect(vault).toBeDefined();
    expect(() => vault.put('value')).toThrow(SecureStorageUnavailableError);
  });
});
