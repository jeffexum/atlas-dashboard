// server/models.ts — model tiering, env-overridable per instance.
//
// cheap    → high-volume mechanical work (scoring, extraction, proactive checks)
// standard → conversational assistant work (Adler chat, briefings)
// critical → outward-facing writing in the user's voice (email drafts, style learning)

export const MODELS = {
  cheap: process.env.MODEL_CHEAP || 'claude-haiku-4-5',
  standard: process.env.MODEL_STANDARD || 'claude-sonnet-4-6',
  critical: process.env.MODEL_CRITICAL || 'claude-fable-5',
} as const;

// claude-fable-5 can decline requests via safety classifiers (HTTP 200 with
// stop_reason "refusal" — occasionally false-positives on benign work).
// This helper retries the same request on the standard model so a decline
// never breaks a draft. Also covers orgs where Fable is unavailable (e.g.
// zero-data-retention config returns 400) by falling back on request errors.
import type Anthropic from '@anthropic-ai/sdk';
import { trackModelCall } from './audit.js';

export async function createCritical(
  client: Anthropic,
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>
): Promise<Anthropic.Message> {
  try {
    const response = await client.messages.create({ ...params, model: MODELS.critical });
    trackModelCall('draft-critical', response.model, response.usage).catch(() => {});
    if (response.stop_reason !== 'refusal') {
      console.log(`[models] critical call served by ${response.model}`);
      return response;
    }
    console.warn(`[models] ${MODELS.critical} refused (${JSON.stringify((response as unknown as { stop_details?: unknown }).stop_details) || 'no details'}) — falling back to ${MODELS.standard}`);
  } catch (err) {
    console.warn(`[models] ${MODELS.critical} error (${(err as Error).message}) — falling back to ${MODELS.standard}`);
  }
  const fallback = await client.messages.create({ ...params, model: MODELS.standard });
  trackModelCall('draft-critical-fallback', fallback.model, fallback.usage).catch(() => {});
  return fallback;
}
