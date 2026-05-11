import { probeProviders, UnsupportedProviderError } from "./adapters";
import { ApiError, errorResponse, jsonResponse } from "./http";
import { validateBaseUrl } from "./security";
import type { CheckRequestBody, Env } from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

export interface HandlerDeps {
  fetcher?: typeof fetch;
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: HandlerDeps = {}
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/check") {
    return handleCheck(request, env, deps);
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response("Not found", { status: 404 });
}

async function handleCheck(request: Request, env: Env, deps: HandlerDeps): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(new ApiError(405, "method_not_allowed", "use POST /api/check"));
  }

  let body: CheckRequestBody;
  try {
    body = (await request.json()) as CheckRequestBody;
  } catch {
    return errorResponse(new ApiError(400, "invalid_json", "request body must be JSON"));
  }

  const apiKey = requireString(body.api_key, "api_key");
  const secrets = [apiKey];

  try {
    assertAccess(env, body);

    const { baseUrl } = validateBaseUrl(body.base_url);
    const { result, attempts } = await probeProviders({
      baseUrl,
      apiKey,
      timeoutMs: parseTimeout(env.REQUEST_TIMEOUT_MS),
      maxResponseBytes: MAX_RESPONSE_BYTES,
      fetcher: deps.fetcher ?? fetch
    });

    return jsonResponse({
      ok: true,
      status: "ok",
      result,
      attempts
    });
  } catch (error) {
    if (error instanceof UnsupportedProviderError) {
      return jsonResponse(
        {
          ok: false,
          status: error.code,
          error: {
            code: error.code,
            message: error.message
          },
          attempts: error.attempts
        },
        { status: error.status }
      );
    }

    if (error instanceof ApiError) {
      return errorResponse(error, secrets);
    }

    if (error instanceof Error) {
      return errorResponse(new ApiError(400, "invalid_request", error.message), secrets);
    }

    return errorResponse(new ApiError(500, "internal_error", "unexpected error"), secrets);
  }
}

function assertAccess(env: Env, body: CheckRequestBody): void {
  const mode = env.ACCESS_MODE === "public" ? "public" : "private";
  if (mode === "public") {
    return;
  }

  const expected = env.ACCESS_TOKEN;
  if (!expected) {
    throw new ApiError(500, "access_token_not_configured", "private mode requires ACCESS_TOKEN");
  }

  if (typeof body.access_token !== "string" || !constantTimeEquals(body.access_token, expected)) {
    throw new ApiError(401, "unauthorized", "invalid access token");
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "missing_field", `${field} is required`);
  }

  return value.trim();
}

function parseTimeout(value: string | undefined): number {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(parsed)));
}

function constantTimeEquals(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < max; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return diff === 0;
}
