export interface ValidatedBaseUrl {
  baseUrl: string;
  hostname: string;
}

export function validateBaseUrl(input: unknown): ValidatedBaseUrl {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("base_url is required");
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("base_url must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("base_url must use https");
  }

  if (url.username || url.password) {
    throw new Error("base_url must not include username or password");
  }

  const hostname = normalizeHostname(url.hostname);
  const blockedReason = getBlockedHostnameReason(hostname);
  if (blockedReason) {
    throw new Error(`base_url host is not allowed: ${blockedReason}`);
  }

  url.hash = "";
  url.search = "";

  return {
    baseUrl: trimTrailingSlash(url.toString()),
    hostname
  };
}

export function getBlockedHostnameReason(hostname: string): string | null {
  const host = normalizeHostname(hostname);

  if (host === "localhost" || host.endsWith(".localhost")) {
    return "localhost";
  }

  const ipv4 = parseIPv4(host);
  if (ipv4) {
    return getBlockedIPv4Reason(ipv4);
  }

  if (host.includes(":")) {
    return getBlockedIPv6Reason(host);
  }

  return null;
}

export function joinUrl(baseUrl: string, path: string): string {
  const cleanBase = trimTrailingSlash(baseUrl);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function parseIPv4(hostname: string): [number, number, number, number] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return parts as [number, number, number, number];
}

function getBlockedIPv4Reason(parts: [number, number, number, number]): string | null {
  const [a, b] = parts;

  if (a === 0) return "unspecified IPv4 range";
  if (a === 10) return "private IPv4 range";
  if (a === 127) return "loopback IPv4 range";
  if (a === 169 && b === 254) return "link-local IPv4 range";
  if (a === 172 && b >= 16 && b <= 31) return "private IPv4 range";
  if (a === 192 && b === 168) return "private IPv4 range";
  if (a === 100 && b >= 64 && b <= 127) return "carrier-grade NAT IPv4 range";
  if (a === 198 && (b === 18 || b === 19)) return "benchmark IPv4 range";
  if (a >= 224) return "multicast or reserved IPv4 range";

  return null;
}

function getBlockedIPv6Reason(hostname: string): string | null {
  if (hostname === "::" || hostname === "::1") {
    return "loopback or unspecified IPv6 address";
  }

  if (hostname.startsWith("::ffff:")) {
    const mapped = hostname.slice("::ffff:".length);
    const mappedIPv4 = parseIPv4(mapped);
    if (!mappedIPv4) {
      return "IPv4-mapped IPv6 address";
    }

    return getBlockedIPv4Reason(mappedIPv4);
  }

  if (hostname.startsWith("fe80:")) {
    return "link-local IPv6 range";
  }

  if (hostname.startsWith("fc") || hostname.startsWith("fd")) {
    return "unique local IPv6 range";
  }

  if (hostname.startsWith("ff")) {
    return "multicast IPv6 range";
  }

  return null;
}
