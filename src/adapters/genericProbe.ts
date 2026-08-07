import { fetchJsonWithLimits, UpstreamFetchError } from "../fetchJson";
import { joinUrl } from "../security";
import type { NormalizedUsage, ProviderAdapter, ProbeAttempt } from "../types";
import {
  asRecord,
  authFailed,
  matched,
  modelList,
  normalizeExpiresAt,
  notMatched,
  numberField,
  type ProbeAttemptInput,
  stringField,
  upstreamError
} from "./common";

const GENERIC_PATHS = [
  "/dashboard/billing/credit_grants",
  "/v1/dashboard/billing/credit_grants",
  "/api/user/self",
  "/api/user/token"
];

export const genericProbeAdapter: ProviderAdapter = {
  name: "generic-probe",
  async probe(context) {
    let lastAuthFailure: ProbeAttemptInput | null = null;

    for (const path of GENERIC_PATHS) {
      const attempt = {
        provider: "generic-probe",
        path
      };

      try {
        const response = await fetchJsonWithLimits(
          context.fetcher,
          joinUrl(context.baseUrl, path),
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
          lastAuthFailure = attemptWithStatus;
          continue;
        }

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        if (!response.ok) {
          continue;
        }

        const usage = extractGenericUsage(response.json, path);
        if (usage) {
          return matched(attemptWithStatus, usage);
        }
      } catch (error) {
        if (error instanceof UpstreamFetchError && error.code === "timeout") {
          return upstreamError(attempt, error.message);
        }
      }
    }

    if (lastAuthFailure) {
      return authFailed(lastAuthFailure);
    }

    return notMatched({
      provider: "generic-probe",
      path: GENERIC_PATHS.join(", ")
    });
  }
};

function extractGenericUsage(json: unknown, sourcePath: string): NormalizedUsage | null {
  const candidates = getCandidateRecords(json);

  for (const record of candidates) {
    const balance = numberField(record, [
      "total_granted",
      "total_quota",
      "quota",
      "balance",
      "credit",
      "credits"
    ]);
    const used = numberField(record, ["total_used", "used_quota", "used", "usage"]);
    const remaining = numberField(record, [
      "total_available",
      "remaining",
      "remain",
      "remaining_quota",
      "available_quota",
      "available"
    ]);

    if (balance === null && used === null && remaining === null) {
      continue;
    }

    const expires = normalizeExpiresAt(
      record.expires_at ?? record.expired_at ?? record.expire_time ?? record.expiration_time
    );

    return {
      provider: "generic-probe",
      platform: "Generic Probe",
      sourcePath,
      tokenName: stringField(record, ["name", "token_name", "key_name"]),
      balance,
      used,
      remaining,
      unit: "unknown",
      expiresAt: expires.expiresAt,
      expiresAtUnix: expires.expiresAtUnix,
      neverExpires: expires.neverExpires,
      models: [],
      modelLimits: modelList(record.model_limits),
      raw: json
    };
  }

  return null;
}

function getCandidateRecords(json: unknown): Record<string, unknown>[] {
  const root = asRecord(json);
  if (!root) {
    return [];
  }

  const records = [root];
  const data = asRecord(root.data);
  if (data) records.push(data);

  const user = asRecord(data?.user ?? root.user);
  if (user) records.push(user);

  const token = asRecord(data?.token ?? root.token);
  if (token) records.push(token);

  return records;
}
