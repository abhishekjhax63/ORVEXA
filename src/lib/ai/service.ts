import "server-only";

import { getAiProviderConfig, type AiProviderConfig } from "@/lib/ai/config";
import type { AiProviderId } from "@/lib/ai/capabilities";
import { aiFailure, type AiProvider, type AiResult } from "@/lib/ai/provider";
import { OpenAiProvider } from "@/lib/ai/providers/openai";

/**
 * Resolves the configured AI provider.
 *
 * This is the only module that knows which implementations exist. Adding a
 * vendor means adding a profile in `src/lib/ai/capabilities.ts`, a file in
 * `src/lib/ai/providers/` and one line in `PROVIDER_FACTORIES` — the rest of
 * the application depends on `AiProvider` and never on a vendor name.
 *
 * When nothing is configured this returns a typed failure rather than an
 * implementation, so a caller cannot accidentally reach a "default" provider
 * that would have to be faked.
 */

const PROVIDER_FACTORIES: Record<AiProviderId, (config: AiProviderConfig) => AiProvider> = {
  openai: (config) =>
    new OpenAiProvider({
      apiKey: config.apiKey,
      organization: config.organization,
      baseUrl: config.baseUrl,
      model: config.model,
      visionModel: config.visionModel,
      transcribeModel: config.transcribeModel,
    }),
};

/** The provider for this deployment, or `undefined` when none is configured. */
export function getAiProvider(): AiProvider | undefined {
  const config = getAiProviderConfig();
  if (!config) return undefined;
  return PROVIDER_FACTORIES[config.provider](config);
}

/**
 * The provider, or a renderable failure.
 *
 * Callers use this when they must have a provider to continue: a route answers
 * with `not_configured` and the workspace shows that the assistant is
 * unavailable, instead of producing anything that looks like medical output.
 */
export function requireAiProvider(): AiResult<AiProvider> {
  const provider = getAiProvider();
  if (!provider) return aiFailure<AiProvider>("not_configured");
  return { ok: true, data: provider };
}
