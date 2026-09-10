/**
 * Give the suite a deterministic vault key.
 *
 * Without one, any test that reaches the platform content store asks the host
 * for a secret: DPAPI on Windows, the Secret Service on Linux. A desktop has
 * both, a CI runner has neither, so `POST /v1/chat/sessions` answered 500 with
 * "Linux Secret Service is unavailable (spawnSync secret-tool ENOENT)" and the
 * suite failed on Linux while passing on Windows. That failure predates the
 * work in this branch; it is visible in the CI runs of the two commits before
 * it.
 *
 * A test that depends on the developer's keyring is not testing the product.
 * Setting the key here makes the run hermetic on every host and keeps the
 * assertion about the endpoint rather than about the machine.
 *
 * This does NOT change how a real installation stores its key, and it is
 * deliberately not a fallback: what a headless host without a Secret Service
 * should do is a security decision about key storage, not something a test
 * helper may decide. It is recorded as an open question instead.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 32 bytes, base64. Fixed rather than random so a failure reproduces exactly.
process.env.CONDUIT_VAULT_KEY ??= Buffer.alloc(32, 7).toString('base64');

/**
 * Give the suite its own runtime directory as well.
 *
 * Without this the tests read and write the developer's real state directory,
 * which has two consequences. Content encrypted there under the machine key
 * cannot be read back with the test key, so the run fails with "encrypted
 * content failed authentication" - the state of the previous run decides
 * whether this one passes. And a test run mutates real local state, which no
 * test should do.
 *
 * config.test.ts sets CONDUIT_HOME itself to prove the override works; ??=
 * leaves any such explicit assignment alone.
 */
process.env.CONDUIT_HOME ??= mkdtempSync(join(tmpdir(), 'conduit-test-'));
