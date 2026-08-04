const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export interface PublicConfig {
  githubIconUrls: string[];
}

export function parseGithubIconUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const urls = [];
  const seen = new Set<string>();

  for (const line of value.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate || !isHttpUrl(candidate) || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    urls.push(candidate);
  }

  return urls;
}

export function getPublicConfig(env: Pick<EnvConfig, "GITHUB_ICON_URLS">): PublicConfig {
  return {
    githubIconUrls: parseGithubIconUrls(env.GITHUB_ICON_URLS)
  };
}

function isHttpUrl(value: string): boolean {
  try {
    return HTTP_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

interface EnvConfig {
  GITHUB_ICON_URLS?: string;
}
