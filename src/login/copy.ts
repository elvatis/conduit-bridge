// ── User-facing login text ───────────────────────────────────────────────────
//
// One place for every sentence a person reads about browser login, so the
// wording stays consistent and nothing technical leaks into the main view.
//
// Rules followed here:
//   - name the provider,
//   - say what the person should DO next,
//   - never show a selector, stack trace, URL query string or credential,
//   - never promise that retrying will work,
//   - always offer the alternative transports that already ship.

import type { ProviderName } from '../types.js';
import type { LoginDiagnostics, LoginState } from './state.js';

export type LoginAction = 'open_browser' | 'recheck' | 'cancel' | 'retry' | 'use_api_key' | 'none';

export interface LoginCopy {
  /** One short status line. */
  message: string;
  /** What the person should do now, or undefined when nothing is needed. */
  nextAction?: string;
  /** Buttons the dashboard should offer, in order. */
  actions: LoginAction[];
}

const LABELS: Record<string, string> = {
  grok: 'Grok',
  claude: 'Claude',
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
};

export function providerLabel(provider: ProviderName): string {
  return LABELS[provider] ?? provider;
}

/** The transports that stay available when a browser login cannot be completed. */
const ALTERNATIVES: Record<string, string> = {
  claude: 'You can keep using Claude through api-claude/* with an API key, or cli-claude/* with the local Claude CLI.',
  perplexity: 'You can keep using Perplexity through api-perplexity/* with an API key.',
  chatgpt: 'You can keep using OpenAI models through api-codex/* with an API key, or cli-codex/* with the local Codex CLI.',
  gemini: 'You can keep using Gemini through api-gemini/* with an API key, or cli-gemini/* with the local CLI.',
  grok: 'You can keep using Grok through cli-grok/* with the local Grok CLI, or api-openrouter/* with an OpenRouter key.',
};

function alternative(provider: ProviderName): string {
  return ALTERNATIVES[provider] ?? 'You can use one of the api-* or cli-* transports for this model family instead.';
}

export function copyFor(
  provider: ProviderName,
  state: LoginState,
  diagnostics: LoginDiagnostics = {},
): LoginCopy {
  const name = providerLabel(provider);
  const kind = diagnostics.challengeKind;

  switch (state) {
    case 'starting':
      return {
        message: `Preparing a browser session for ${name}.`,
        nextAction: 'Wait a moment while the login browser starts.',
        actions: ['cancel'],
      };

    case 'browser_ready':
      return {
        message: `The ${name} login browser is open.`,
        nextAction: 'Open the login browser and sign in as you normally would.',
        actions: ['open_browser', 'recheck', 'cancel'],
      };

    case 'waiting_for_user':
      return {
        message: `Waiting for you to finish signing in to ${name}.`,
        nextAction: 'Complete the sign-in in the login browser, then choose "Check login status". Closing the window is fine — Conduit checks the result and reopens it if the sign-in did not take. Choose Cancel to stop.',
        actions: ['open_browser', 'recheck', 'cancel'],
      };

    case 'verifying':
      return {
        message: `Checking the ${name} session.`,
        nextAction: 'This closes the login browser and can take up to a minute. It will reopen if anything is still needed.',
        actions: ['cancel'],
      };

    case 'authenticated':
      return {
        message: `Signed in to ${name}. The profile was saved and will be reused automatically.`,
        actions: ['none'],
      };

    case 'challenge_detected':
      if (kind === 'cloudflare_interactive') {
        return {
          message: `${name} is showing a security check.`,
          nextAction: 'Open the login browser and complete the check yourself, then choose "Check login status". Conduit will not complete it for you.',
          actions: ['open_browser', 'recheck', 'cancel'],
        };
      }
      return {
        message: `${name} is running a security check on this browser.`,
        nextAction: 'Open the login browser and follow whatever the page asks for, then choose "Check login status". If it keeps spinning without asking anything, the provider is not letting this connection through.',
        actions: ['open_browser', 'recheck', 'cancel'],
      };

    case 'blocked':
      if (kind === 'google_untrusted_browser') {
        return {
          message: `Google declined the sign-in for ${name}.`,
          nextAction: `Google did not consider this browser or device trustworthy enough to sign in. Sign in on a browser you already use for this Google account, then retry session restore. ${alternative(provider)}`,
          actions: ['retry', 'use_api_key'],
        };
      }
      return {
        message: `Login is blocked by ${name} on this network.`,
        nextAction: `Complete authentication in a supported browser environment and retry session restore. Do not retry immediately — repeated attempts can extend the block. ${alternative(provider)}`,
        actions: ['retry', 'use_api_key'],
      };

    case 'timeout':
      return {
        message: `The ${name} login did not finish in time.`,
        nextAction: 'Start the login again when you are ready to complete it. Nothing was changed.',
        actions: ['retry', 'use_api_key'],
      };

    case 'cancelled':
      return {
        message: `The ${name} login was cancelled.`,
        nextAction: 'Start it again whenever you like.',
        actions: ['retry'],
      };

    case 'failed':
    default:
      return {
        message: `The ${name} login could not be started.`,
        // diagnostics.reason is machine text; it belongs in the technical
        // details panel, not in the sentence the person reads first.
        nextAction: `Check that the login browser session is running, then try again. The technical details explain what failed. ${alternative(provider)}`,
        actions: ['retry', 'use_api_key'],
      };
  }
}

/**
 * The message shown when a session could not be restored later on, which is a
 * different situation from a first login.
 */
export function restoreFailureCopy(provider: ProviderName, state: LoginState, diagnostics: LoginDiagnostics = {}): string {
  const name = providerLabel(provider);
  if (state === 'blocked') {
    return `${name} refused the saved session on this network. ${alternative(provider)}`;
  }
  if (state === 'challenge_detected') {
    return `${name} is asking for a security check that only a person can complete. Start a browser login to finish it.`;
  }
  if (diagnostics.reason) return `${name} session could not be restored: ${diagnostics.reason}`;
  return `${name} has a saved profile but is not signed in. Start a browser login.`;
}
