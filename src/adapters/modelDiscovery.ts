import { fetchJsonWithLimits, UpstreamFetchError } from "../fetchJson";
import { joinUrl } from "../security";
import type { ProbeAttempt, ProbeContext } from "../types";
import { asRecord, modelList, stringField } from "./common";

export interface ModelDiscoveryResult {
  models: string[];
  attempt: ProbeAttempt;
}

const MODELS_PATH = "/v1/models";
const MODELS_ENTRYPOINT_PATH = "/models";
const PROVIDER = "openai-models";

export async function discoverModels(context: ProbeContext): Promise<ModelDiscoveryResult> {
  const entryPointPath = baseUrlEndsWithV1(context.baseUrl) ? MODELS_ENTRYPOINT_PATH : MODELS_PATH;
  const attempt = {
    provider: PROVIDER,
    path: entryPointPath
  };

  try {
    const response = await fetchJsonWithLimits(
      context.fetcher,
      joinUrl(context.baseUrl, entryPointPath),
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

    const attemptWithStatus = { ...attempt, status: response.status };

    if (response.status === 401 || response.status === 403) {
      return { models: [], attempt: { ...attemptWithStatus, outcome: "auth_failed" } };
    }

    if (response.status === 404 || response.status === 405) {
      return { models: [], attempt: { ...attemptWithStatus, outcome: "not_matched" } };
    }

    if (!response.ok) {
      return { models: [], attempt: { ...attemptWithStatus, outcome: "upstream_error" } };
    }

    const models = extractModels(response.json);
    if (models.length === 0) {
      return { models: [], attempt: { ...attemptWithStatus, outcome: "not_matched" } };
    }

    return { models, attempt: { ...attemptWithStatus, outcome: "matched" } };
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      return { models: [], attempt: { ...attempt, outcome: "upstream_error" } };
    }

    return { models: [], attempt: { ...attempt, outcome: "upstream_error" } };
  }
}

function baseUrlEndsWithV1(baseUrl: string): boolean {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, "");
  return pathname === "/v1" || pathname.endsWith("/v1");
}

export function extractModels(value: unknown): string[] {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const candidates = [
    root?.models,
    data?.models,
    root?.data,
    Array.isArray(value) ? value : undefined,
    value
  ];

  const seen = new Set<string>();
  const models: string[] = [];
  for (const candidate of candidates) {
    for (const model of modelsFromCandidate(candidate)) {
      if (!seen.has(model)) {
        seen.add(model);
        models.push(model);
      }
    }
  }

  return models;
}

export function modelsFromCandidate(value: unknown): string[] {
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
