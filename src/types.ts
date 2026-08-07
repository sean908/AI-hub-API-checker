export interface Env {
  ASSETS?: {
    fetch(input: Request | string, init?: RequestInit): Promise<Response>;
  };
  ACCESS_MODE?: string;
  ACCESS_TOKEN?: string;
  REQUEST_TIMEOUT_MS?: string;
  APP_VERSION?: string;
  BUILD_SHA?: string;
  GITHUB_ICON_URLS?: string;
}

export interface CheckRequestBody {
  base_url?: unknown;
  api_key?: unknown;
  access_token?: unknown;
}

export interface NormalizedUsage {
  provider: string;
  platform: string;
  sourcePath: string;
  tokenName?: string;
  status?: string;
  balance: number | null;
  used: number | null;
  remaining: number | null;
  unit: "quota" | "unknown";
  unlimitedQuota?: boolean;
  expiresAt: string | null;
  expiresAtUnix: number | null;
  neverExpires?: boolean;
  models: string[];
  modelLimits?: string[];
  modelLimitsEnabled?: boolean;
  usageWindows?: {
    usage5h?: number;
    usage1d?: number;
    usage7d?: number;
  };
  rateLimits?: {
    rateLimit5h?: number;
    rateLimit1d?: number;
    rateLimit7d?: number;
  };
  raw: unknown;
}

export interface ProbeAttempt {
  provider: string;
  path: string;
  status?: number;
  outcome: "matched" | "not_matched" | "auth_failed" | "upstream_error";
}

export interface ProbeContext {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxResponseBytes: number;
  fetcher: typeof fetch;
}

export type AdapterResult =
  | {
      kind: "matched";
      attempt: ProbeAttempt;
      result: NormalizedUsage;
    }
  | {
      kind: "not_matched";
      attempt: ProbeAttempt;
    }
  | {
      kind: "auth_failed";
      attempt: ProbeAttempt;
      message: string;
    }
  | {
      kind: "upstream_error";
      attempt: ProbeAttempt;
      message: string;
    };

export interface ProviderAdapter {
  name: string;
  probe(context: ProbeContext): Promise<AdapterResult>;
}
