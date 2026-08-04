export const FALLBACK_GITHUB_ICON_URLS = [
  "https://github.githubassets.com/favicons/favicon.svg",
  "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
  "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
];

export function chooseGithubIconUrl(urls, random = Math.random) {
  const safeUrls = Array.isArray(urls) && urls.length > 0 ? urls : FALLBACK_GITHUB_ICON_URLS;
  const index = Math.min(safeUrls.length - 1, Math.floor(random() * safeUrls.length));
  return safeUrls[index];
}

export async function loadGithubIcon(icon, fetcher = fetch, random = Math.random) {
  if (!icon) {
    return;
  }

  let configuredUrls = [];

  try {
    const response = await fetcher("/api/config", {
      headers: {
        accept: "application/json"
      }
    });
    if (response.ok) {
      const config = await response.json();
      configuredUrls = getValidIconUrls(config?.githubIconUrls);
    }
  } catch {
    configuredUrls = [];
  }

  icon.src = chooseGithubIconUrl(configuredUrls, random);
}

function getValidIconUrls(urls) {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls.filter((url) => typeof url === "string" && isHttpUrl(url));
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
