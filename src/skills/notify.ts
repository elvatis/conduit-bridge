import { logger } from '../logger.js';
import { redactSecrets } from '../redact.js';
import { SkillError, type SkillDefinition, type SkillExecutionContext } from './index.js';

/** Notification channels require host configuration; request bodies cannot select a destination URL. */
export type NotificationChannel = 'log' | 'webhook';
/** Deliver a bounded, redacted message to the configured webhook or the local log. */
export async function notify(message: string, channel: NotificationChannel = 'log', signal?: AbortSignal): Promise<{ channel: NotificationChannel; delivered: boolean }> {
  if (typeof message !== 'string' || !message.trim() || message.length > 2000 || !['log', 'webhook'].includes(channel)) throw new SkillError('Invalid notification');
  const safe = redactSecrets(message).replace(/[\r\n\x00-\x1f]+/g, ' ');
  const endpoint = process.env.CONDUIT_NOTIFY_WEBHOOK_URL;
  if (channel === 'log' || !endpoint) { logger.info(`[notification] ${safe}`); return { channel: 'log', delivered: true }; }
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new SkillError('Configured notification webhook is invalid', 503); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new SkillError('Webhook requires HTTPS without URL credentials', 503);
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: safe }), signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]) });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Webhook rejected notification');
    return { channel: 'webhook', delivered: true };
  } catch { throw new SkillError('Notification delivery failed', 502); }
}
/** Authorize external delivery separately even when used inside another tool. */
export async function notifyCompletion(message: string, channel: NotificationChannel, context: SkillExecutionContext): Promise<unknown> {
  await context.authorize(channel === 'webhook' ? 'write' : 'read', { skill: 'notify' });
  context.signal.throwIfAborted();
  return notify(message, channel, context.signal);
}
/** Explicit notification tool; log-only is the default. */
export const notifySkill: SkillDefinition = {
  name: 'notify', description: 'Send a redacted message to the local log or a host-configured HTTPS webhook.', effect: input => input.channel === 'webhook' ? 'write' : 'read',
  schema: { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string', maxLength: 2000 }, channel: { type: 'string', enum: ['log', 'webhook'] } } },
  async execute(input, context) { return notifyCompletion(input.message as string, (input.channel ?? 'log') as NotificationChannel, context); },
};
