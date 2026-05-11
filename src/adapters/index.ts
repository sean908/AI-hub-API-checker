import { ApiError } from "../http";
import type { NormalizedUsage, ProbeAttempt, ProbeContext } from "../types";
import { genericProbeAdapter } from "./genericProbe";
import { newApiAdapter } from "./newApi";
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
      return {
        result: outcome.result,
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

  if (lastAuthFailure) {
    throw new ApiError(401, "auth_failed", lastAuthFailure);
  }

  if (lastUpstreamError) {
    throw new ApiError(502, "upstream_error", lastUpstreamError);
  }

  throw new UnsupportedProviderError(attempts);
}

export class UnsupportedProviderError extends ApiError {
  constructor(public readonly attempts: ProbeAttempt[]) {
    super(422, "unsupported_provider", "provider was not recognized by the available probes");
  }
}
