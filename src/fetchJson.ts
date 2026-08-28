export interface FetchJsonResult {
  url: string;
  status: number;
  ok: boolean;
  json: unknown | null;
  text: string;
}

export class UpstreamFetchError extends Error {
  constructor(
    public readonly code: "timeout" | "network_error" | "response_too_large" | "invalid_json",
    message: string,
    public readonly httpStatus?: number
  ) {
    super(message);
  }
}

export async function fetchJsonWithLimits(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  options: {
    timeoutMs: number;
    maxResponseBytes: number;
  }
): Promise<FetchJsonResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs);

  try {
    const response = await fetcher(url, {
      ...init,
      signal: controller.signal
    });
    const text = await readTextWithLimit(response, options.maxResponseBytes);

    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      throw new UpstreamFetchError("invalid_json", "upstream returned non-JSON response", response.status);
    }

    return {
      url,
      status: response.status,
      ok: response.ok,
      json,
      text
    };
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new UpstreamFetchError("timeout", "upstream request timed out");
    }

    throw new UpstreamFetchError("network_error", "upstream request failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new UpstreamFetchError("response_too_large", "upstream response is too large");
    }

    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new UpstreamFetchError("response_too_large", "upstream response is too large");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}
