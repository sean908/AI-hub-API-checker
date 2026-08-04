const UNKNOWN_LABEL = "版本未知";

export function formatVersionInfo(info) {
  if (
    !info ||
    info.ok !== true ||
    !isKnownValue(info.version) ||
    !isKnownValue(info.shortSha)
  ) {
    return UNKNOWN_LABEL;
  }

  return `v${info.version} · ${info.shortSha}`;
}

export async function fetchVersionLabel(fetcher = fetch) {
  try {
    const response = await fetcher("/api/version", {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      return UNKNOWN_LABEL;
    }

    return formatVersionInfo(await response.json());
  } catch {
    return UNKNOWN_LABEL;
  }
}

export async function renderVersionLabel(element, fetcher = fetch) {
  element.textContent = `(${await fetchVersionLabel(fetcher)})`;
}

function isKnownValue(value) {
  return typeof value === "string" && value.trim().length > 0 && value !== "unknown";
}
