import { fetchJsonWithLimits, UpstreamFetchError, type FetchJsonResult } from "../fetchJson";
import { joinUrl } from "../security";
import type { NormalizedUsage, ProviderAdapter } from "../types";
import {
  asRecord,
  authFailed,
  matched,
  modelList,
  normalizeExpiresAt,
  notMatched,
  numberField,
  stringField,
  upstreamError,
  type ProbeAttemptInput
} from "./common";

const USAGE_PATH = "/v1/usage";
const MODELS_PATH = "/v1/models";
const USAGE_ENTRYPOINT_PATH = "/usage";
const MODELS_ENTRYPOINT_PATH = "/models";
const PROVIDER = "sub2api";
const PLATFORM = "Sub2API";

export const sub2apiAdapter: ProviderAdapter = {
  name: PROVIDER,
  async probe(context) {
    const usageAttempt = {
      provider: PROVIDER,
      path: USAGE_PATH
    };

    try {
      const usageResponse = await fetchSub2apiJson(context, USAGE_PATH, USAGE_ENTRYPOINT_PATH);
      const usageAttemptWithStatus = { ...usageAttempt, status: usageResponse.status };

      if (isAuthFailure(usageResponse.status)) {
        return authFailed(usageAttemptWithStatus);
      }

      if (usageResponse.ok) {
        const usage = extractUsage(usageResponse.json, USAGE_PATH);
        if (usage) {
          return matched(usageAttemptWithStatus, usage);
        }
      } else if (!isProbeMiss(usageResponse.status)) {
        return upstreamError(usageAttemptWithStatus, `upstream returned HTTP ${usageResponse.status}`);
      }

      return await probeModels(context, usageAttemptWithStatus);
    } catch (error) {
      if (error instanceof UpstreamFetchError) {
        if (error.code === "timeout" || error.code === "network_error") {
          return upstreamError(usageAttempt, error.message);
        }

        return await probeModels(context, usageAttempt);
      }

      return upstreamError(usageAttempt, "sub2api probe failed");
    }
  }
};

async function fetchSub2apiJson(
  context: Parameters<ProviderAdapter["probe"]>[0],
  versionedPath: string,
  entryPointPath: string
): Promise<FetchJsonResult> {
  return fetchJsonWithLimits(
    context.fetcher,
    getSub2apiUrl(context.baseUrl, versionedPath, entryPointPath),
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "x-api-key": context.apiKey,
        accept: "application/json"
      }
    },
    {
      timeoutMs: context.timeoutMs,
      maxResponseBytes: context.maxResponseBytes
    }
  );
}

function getSub2apiUrl(baseUrl: string, versionedPath: string, entryPointPath: string): string {
  return joinUrl(baseUrl, baseUrlEndsWithV1(baseUrl) ? entryPointPath : versionedPath);
}

function baseUrlEndsWithV1(baseUrl: string): boolean {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
  return pathname === "/v1" || pathname.endsWith("/v1");
}

async function probeModels(
  context: Parameters<ProviderAdapter["probe"]>[0],
  previousAttempt: ProbeAttemptInput
) {
  const attempt = {
    provider: PROVIDER,
    path: MODELS_PATH
  };

  try {
    const response = await fetchSub2apiJson(context, MODELS_PATH, MODELS_ENTRYPOINT_PATH);
    const attemptWithStatus = { ...attempt, status: response.status };

    if (isAuthFailure(response.status)) {
      return authFailed(attemptWithStatus);
    }

    if (isProbeMiss(response.status)) {
      return notMatched(previousAttempt);
    }

    if (!response.ok) {
      return upstreamError(attemptWithStatus, `upstream returned HTTP ${response.status}`);
    }

    const models = extractModels(response.json);
    if (models.length === 0) {
      return notMatched(attemptWithStatus);
    }

    return matched(attemptWithStatus, {
      provider: PROVIDER,
      platform: PLATFORM,
      sourcePath: MODELS_PATH,
      balance: null,
      used: null,
      remaining: null,
      unit: "unknown",
      expiresAt: null,
      expiresAtUnix: null,
      models,
      raw: response.json
    });
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      if (error.code === "timeout" || error.code === "network_error") {
        return upstreamError(attempt, error.message);
      }

      return notMatched(previousAttempt);
    }

    return upstreamError(attempt, "sub2api models probe failed");
  }
}

function extractUsage(json: unknown, sourcePath: string): NormalizedUsage | null {
  const root = asRecord(json);
  if (!root) {
    return null;
  }

  const data = asRecord(root.data) ?? root;
  const quota = asRecord(data.quota);
  const usage = asRecord(data.usage);

  const balance = quota
    ? numberField(quota, ["limit", "total", "quota"])
    : numberField(data, ["quota", "total_quota", "balance"]);
  const used = quota
    ? numberField(quota, ["used", "quota_used"])
    : numberField(data, ["quota_used", "used_quota", "used"]);
  const remaining =
    numberField(quota ?? data, ["remaining", "available", "total_available"]) ??
    calculateRemaining(balance, used);

  const usageWindows = extractUsageWindows(data, usage);
  const rateLimits = extractRateLimits(data);
  const models = extractModels(data.models ?? root.models ?? root.data);

  if (
    balance === null &&
    used === null &&
    remaining === null &&
    models.length === 0 &&
    Object.keys(usageWindows).length === 0 &&
    Object.keys(rateLimits).length === 0
  ) {
    return null;
  }

  const expires = normalizeExpiresAt(
    data.expires_at ?? data.expired_at ?? data.expire_time ?? data.expiration_time
  );

  return {
    provider: PROVIDER,
    platform: PLATFORM,
    sourcePath,
    tokenName: stringField(data, ["name", "token_name", "key_name"]),
    status: stringField(data, ["status", "state"]),
    balance,
    used,
    remaining,
    unit: balance === null && used === null && remaining === null ? "unknown" : "quota",
    expiresAt: expires.expiresAt,
    expiresAtUnix: expires.expiresAtUnix,
    neverExpires: expires.neverExpires,
    models,
    usageWindows: Object.keys(usageWindows).length > 0 ? usageWindows : undefined,
    rateLimits: Object.keys(rateLimits).length > 0 ? rateLimits : undefined,
    raw: json
  };
}

function extractUsageWindows(
  data: Record<string, unknown>,
  usage: Record<string, unknown> | null
): NonNullable<NormalizedUsage["usageWindows"]> {
  const windows: NonNullable<NormalizedUsage["usageWindows"]> = {};
  const usage5h = numberField(data, ["usage_5h"]);
  const usage1d = numberField(data, ["usage_1d"]);
  const usage7d = numberField(data, ["usage_7d"]);

  if (usage5h !== null) windows.usage5h = usage5h;
  if (usage1d !== null) windows.usage1d = usage1d;
  if (usage7d !== null) windows.usage7d = usage7d;

  if (usage) {
    const today = numberField(usage, ["today", "daily", "day"]);
    const total = numberField(usage, ["total"]);
    if (today !== null && windows.usage1d === undefined) windows.usage1d = today;
    if (total !== null && windows.usage7d === undefined) windows.usage7d = total;
  }

  for (const rateLimit of getRateLimitRecords(data)) {
    const window = stringField(rateLimit, ["window", "period"]);
    const used = numberField(rateLimit, ["used", "usage"]);
    if (used === null || !window) {
      continue;
    }

    if (isFiveHourWindow(window) && windows.usage5h === undefined) windows.usage5h = used;
    if (isOneDayWindow(window) && windows.usage1d === undefined) windows.usage1d = used;
    if (isSevenDayWindow(window) && windows.usage7d === undefined) windows.usage7d = used;
  }

  return windows;
}

function extractRateLimits(
  data: Record<string, unknown>
): NonNullable<NormalizedUsage["rateLimits"]> {
  const limits: NonNullable<NormalizedUsage["rateLimits"]> = {};
  const rateLimit5h = numberField(data, ["rate_limit_5h"]);
  const rateLimit1d = numberField(data, ["rate_limit_1d"]);
  const rateLimit7d = numberField(data, ["rate_limit_7d"]);

  if (rateLimit5h !== null) limits.rateLimit5h = rateLimit5h;
  if (rateLimit1d !== null) limits.rateLimit1d = rateLimit1d;
  if (rateLimit7d !== null) limits.rateLimit7d = rateLimit7d;

  for (const rateLimit of getRateLimitRecords(data)) {
    const window = stringField(rateLimit, ["window", "period"]);
    const limit = numberField(rateLimit, ["limit", "quota"]);
    if (limit === null || !window) {
      continue;
    }

    if (isFiveHourWindow(window) && limits.rateLimit5h === undefined) limits.rateLimit5h = limit;
    if (isOneDayWindow(window) && limits.rateLimit1d === undefined) limits.rateLimit1d = limit;
    if (isSevenDayWindow(window) && limits.rateLimit7d === undefined) limits.rateLimit7d = limit;
  }

  return limits;
}

function getRateLimitRecords(data: Record<string, unknown>): Record<string, unknown>[] {
  const rateLimits = data.rate_limits ?? data.rateLimits;
  if (!Array.isArray(rateLimits)) {
    return [];
  }

  return rateLimits.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function extractModels(value: unknown): string[] {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const candidates = [
    root?.models,
    data?.models,
    root?.data,
    Array.isArray(value) ? value : undefined,
    value
  ];

  for (const candidate of candidates) {
    const models = modelsFromCandidate(candidate);
    if (models.length > 0) {
      return models;
    }
  }

  return [];
}

function modelsFromCandidate(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string" && item.length > 0) {
        return [item];
      }

      const record = asRecord(item);
      const id = record ? stringField(record, ["id", "name", "model"]) : undefined;
      return id ? [id] : [];
    });
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const directModel = stringField(record, ["id", "name", "model"]);
  if (directModel) {
    return [directModel];
  }

  const values = Object.values(record);
  const looksLikeModelMap =
    values.length > 0 &&
    values.every(
      (item) =>
        typeof item === "boolean" ||
        typeof item === "number" ||
        typeof item === "string" ||
        item === null
    );

  return looksLikeModelMap ? modelList(record) : [];
}

function calculateRemaining(balance: number | null, used: number | null): number | null {
  if (balance === null || used === null) {
    return null;
  }

  return balance - used;
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function isProbeMiss(status: number): boolean {
  return status === 404 || status === 405;
}

function isFiveHourWindow(value: string): boolean {
  return normalizeWindow(value) === "5h";
}

function isOneDayWindow(value: string): boolean {
  return ["1d", "24h", "day", "daily"].includes(normalizeWindow(value));
}

function isSevenDayWindow(value: string): boolean {
  return ["7d", "week", "weekly"].includes(normalizeWindow(value));
}

function normalizeWindow(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}
