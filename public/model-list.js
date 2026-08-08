export const COPY_FEEDBACK_MS = 1200;
export const MODEL_NAME_MAX_LENGTH = 20;

const MODEL_NAME_ELLIPSIS = "...";

export const COPY_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

export const CHECK_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

export const FAIL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export function renderModelList(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return "";
  }

  const items = models.map((model) => renderModelItem(String(model))).join("");
  return `<span class="model-list">${items}</span>`;
}

export function renderModelItem(modelName) {
  const displayName = escapeHtml(truncateModelName(modelName));
  const safeName = escapeHtml(modelName);
  return `<span class="model-item"><span class="model-name">${displayName}</span><button type="button" class="model-copy" title="复制模型名" aria-label="复制模型名 ${safeName}" data-model-name="${safeName}">${COPY_ICON_SVG}</button></span>`;
}

export function truncateModelName(modelName) {
  const characters = Array.from(modelName);
  if (characters.length <= MODEL_NAME_MAX_LENGTH) {
    return modelName;
  }

  const visibleLength = MODEL_NAME_MAX_LENGTH - MODEL_NAME_ELLIPSIS.length;
  const leadingLength = Math.ceil(visibleLength / 2);
  const trailingLength = visibleLength - leadingLength;

  return `${characters.slice(0, leadingLength).join("")}${MODEL_NAME_ELLIPSIS}${characters
    .slice(-trailingLength)
    .join("")}`;
}

export function formatModels(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return "未知";
  }

  return models.join(", ");
}

export async function copyText(text, options = {}) {
  const clipboard = options.clipboard !== undefined ? options.clipboard : navigator.clipboard;
  const fallback = options.fallbackCopy || fallbackCopy;

  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return "copied";
    } catch {
      // 现代 API 失败时降级到临时 textarea + execCommand
    }
  }

  try {
    return fallback(text) ? "copied" : "failed";
  } catch {
    return "failed";
  }
}

export function fallbackCopy(text, doc = document) {
  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  doc.body.appendChild(textarea);
  textarea.select();
  try {
    return doc.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export function showCopyFeedback(button, status, options = {}) {
  const feedbackMs = options.feedbackMs ?? COPY_FEEDBACK_MS;

  button.classList.remove("copied", "failed");
  if (status === "copied") {
    button.classList.add("copied");
    button.innerHTML = CHECK_ICON_SVG;
    button.setAttribute("title", "已复制");
    button.setAttribute("aria-label", "已复制");
  } else {
    button.classList.add("failed");
    button.innerHTML = FAIL_ICON_SVG;
    button.setAttribute("title", "复制失败");
    button.setAttribute("aria-label", "复制失败");
  }

  clearTimeout(button._copyFeedbackTimer);
  button._copyFeedbackTimer = setTimeout(() => {
    button.classList.remove("copied", "failed");
    button.innerHTML = COPY_ICON_SVG;
    button.setAttribute("title", "复制模型名");
    button.setAttribute("aria-label", `复制模型名 ${button.dataset?.modelName ?? ""}`);
  }, feedbackMs);
}

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
