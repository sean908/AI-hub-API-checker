import { fetchJsonWithLimits, UpstreamFetchError } from "../fetchJson";
import { joinUrl } from "../security";
import type { ProviderAdapter } from "../types";
import {
  asRecord,
  authFailed,
  booleanField,
  matched,
  modelList,
  normalizeExpiresAt,
  notMatched,
  numberField,
  stringField,
  upstreamError
} from "./common";

const SOURCE_PATH = "/api/usage/token";

export const newApiAdapter: ProviderAdapter = {
  name: "new-api",
  async probe(context) {
    const attempt = {
      provider: "new-api",
      path: SOURCE_PATH
    };

    try {
      const response = await fetchJsonWithLimits(
        context.fetcher,
        joinUrl(context.baseUrl, SOURCE_PATH),
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${context.apiKey}`,
            accept: "application/json"
          }
        },
        {
          timeoutMs: context.timeoutMs,
          maxResponseBytes: context.maxResponseBytes
        }
      );

      const attemptWithStatus = { ...attempt, status: response.status };

      if (response.status === 401 || response.status === 403) {
        return authFailed(attemptWithStatus);
      }

      if (response.status === 404 || response.status === 405) {
        return notMatched(attemptWithStatus);
      }

      if (!response.ok) {
        return upstreamError(attemptWithStatus, `upstream returned HTTP ${response.status}`);
      }

      const root = asRecord(response.json);
      const data = asRecord(root?.data);
      if (!data || !looksLikeNewApiUsage(data)) {
        return notMatched(attemptWithStatus);
      }

      const expires = normalizeExpiresAt(data.expires_at);

      return matched(attemptWithStatus, {
        provider: "new-api",
        platform: "New API",
        sourcePath: SOURCE_PATH,
        tokenName: stringField(data, ["name"]),
        balance: numberField(data, ["total_granted"]),
        used: numberField(data, ["total_used"]),
        remaining: numberField(data, ["total_available"]),
        unit: "quota",
        unlimitedQuota: booleanField(data, ["unlimited_quota"]),
        expiresAt: expires.expiresAt,
        expiresAtUnix: expires.expiresAtUnix,
        neverExpires: expires.neverExpires,
        models: modelList(data.model_limits),
        modelLimitsEnabled: booleanField(data, ["model_limits_enabled"]),
        raw: response.json
      });
    } catch (error) {
      if (error instanceof UpstreamFetchError) {
        return upstreamError(attempt, error.message);
      }

      return upstreamError(attempt, "new-api probe failed");
    }
  }
};

function looksLikeNewApiUsage(data: Record<string, unknown>): boolean {
  return (
    data.object === "token_usage" ||
    "total_granted" in data ||
    "total_used" in data ||
    "total_available" in data ||
    "expires_at" in data
  );
}
