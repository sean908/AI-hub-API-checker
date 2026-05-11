import type { AdapterResult, NormalizedUsage, ProbeAttempt } from "../types";

export type ProbeAttemptInput = Omit<ProbeAttempt, "outcome">;

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

export function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

export function booleanField(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

export function modelList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([, allowed]) => allowed !== false && allowed !== null)
    .map(([model]) => model);
}

export function normalizeExpiresAt(value: unknown): {
  expiresAt: string | null;
  expiresAtUnix: number | null;
  neverExpires: boolean;
} {
  const unix = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;

  if (unix === null || !Number.isFinite(unix)) {
    return {
      expiresAt: null,
      expiresAtUnix: null,
      neverExpires: false
    };
  }

  if (unix <= 0) {
    return {
      expiresAt: null,
      expiresAtUnix: null,
      neverExpires: true
    };
  }

  return {
    expiresAt: new Date(unix * 1000).toISOString(),
    expiresAtUnix: unix,
    neverExpires: false
  };
}

export function matched(attempt: ProbeAttemptInput, result: NormalizedUsage): AdapterResult {
  return {
    kind: "matched",
    attempt: { ...attempt, outcome: "matched" },
    result
  };
}

export function notMatched(attempt: ProbeAttemptInput): AdapterResult {
  return {
    kind: "not_matched",
    attempt: { ...attempt, outcome: "not_matched" }
  };
}

export function authFailed(
  attempt: ProbeAttemptInput,
  message = "upstream rejected the API key"
): AdapterResult {
  return {
    kind: "auth_failed",
    attempt: { ...attempt, outcome: "auth_failed" },
    message
  };
}

export function upstreamError(attempt: ProbeAttemptInput, message: string): AdapterResult {
  return {
    kind: "upstream_error",
    attempt: { ...attempt, outcome: "upstream_error" },
    message
  };
}
