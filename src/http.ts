export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

export function errorResponse(error: ApiError, secrets: string[] = []): Response {
  return jsonResponse(
    {
      ok: false,
      status: error.code,
      error: {
        code: error.code,
        message: sanitizeSecrets(error.message, secrets)
      }
    },
    { status: error.status }
  );
}

export function sanitizeSecrets(message: string, secrets: string[]): string {
  let sanitized = message;

  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length === 0) {
      continue;
    }

    sanitized = sanitized.split(secret).join(maskSecret(secret));
  }

  return sanitized;
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "[redacted]";
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
