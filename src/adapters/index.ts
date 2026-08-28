import { ApiError } from "../http";
import type { NormalizedUsage, ProbeAttempt, ProbeContext } from "../types";
import { genericProbeAdapter } from "./genericProbe";
import { newApiAdapter } from "./newApi";
import { discoverModels } from "./modelDiscovery";
import { sub2apiAdapter } from "./sub2api";

const adapters = [newApiAdapter, sub2apiAdapter, genericProbeAdapter];

export interface ProbeSuccess {
  result: NormalizedUsage;
  attempts: ProbeAttempt[];
}

export async function probeProviders(context: ProbeContext): Promise<ProbeSuccess> {
  const attempts: ProbeAttempt[] = [];
  let lastAuthFailure: string | null = null;
  let lastUpstreamError: string | null = null;

  for (const adapter of adapters) {
    const outcome = await adapter.probe(context);
    attempts.push(outcome.attempt);

    if (outcome.kind === "matched") {
      const discovery = await discoverModels(context);
      attempts.push(discovery.attempt);

      return {
        result: {
          ...outcome.result,
          models: discovery.models
        },
        attempts
      };
    }

    if (outcome.kind === "auth_failed") {
      lastAuthFailure = outcome.message;
      continue;
    }

    if (outcome.kind === "upstream_error") {
      lastUpstreamError = outcome.message;
      continue;
    }
  }

  // No usage/quota adapter identified the provider. The key may still grant access to a
  // plain OpenAI-compatible models endpoint, so fall back to neutral model discovery
  // rather than misreporting an unrecognized provider as Sub2API. If a key was
  // explicitly rejected by an adapter, probing models would fail too, so honor that
  // auth failure without issuing extra requests.
  if (!lastAuthFailure) {
    const discovery = await discoverModels(context);
    attempts.push(discovery.attempt);

    if (discovery.attempt.outcome === "matched") {
      return {
        result: openAiCompatibleResult(discovery),
        attempts
      };
    }

    if (discovery.attempt.outcome === "auth_failed") {
      lastAuthFailure = "upstream rejected the API key on the models endpoint";
    } else if (discovery.attempt.outcome === "upstream_error") {
      lastUpstreamError ??= "openai-models probe failed";
    }
  }

  if (lastAuthFailure) {
    throw new ApiError(401, "auth_failed", lastAuthFailure);
  }

  if (lastUpstreamError) {
    throw new ApiError(502, "upstream_error", lastUpstreamError);
  }

  throw new UnsupportedProviderError(attempts);
}

function openAiCompatibleResult(discovery: {
  models: string[];
  attempt: ProbeAttempt;
}): NormalizedUsage {
  return {
    provider: discovery.attempt.provider,
    platform: "OpenAI-compatible",
    sourcePath: discovery.attempt.path,
    balance: null,
    used: null,
    remaining: null,
    unit: "unknown",
    expiresAt: null,
    expiresAtUnix: null,
    models: discovery.models,
    raw: null
  };
}

export class UnsupportedProviderError extends ApiError {
  constructor(public readonly attempts: ProbeAttempt[]) {
    super(422, "unsupported_provider", "provider was not recognized by the available probes");
  }
}
