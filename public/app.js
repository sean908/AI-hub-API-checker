import { renderVersionLabel } from "./version.js";
import { loadGithubIcon } from "./github-icon.js";

const form = document.querySelector("#check-form");
const apiKeyInput = document.querySelector("#api-key");
const toggleKeyButton = document.querySelector("#toggle-key");
const submitButton = document.querySelector("#submit-button");
const statusPill = document.querySelector("#status-pill");
const emptyState = document.querySelector("#empty-state");
const resultView = document.querySelector("#result-view");
const summaryGrid = document.querySelector("#summary-grid");
const otherDetails = document.querySelector("#other-details");
const otherGrid = document.querySelector("#other-grid");
const jsonDetails = document.querySelector("#json-details");
const jsonOutput = document.querySelector("#json-output");
const copyJsonButton = document.querySelector("#copy-json");
const appVersion = document.querySelector("#app-version");
const githubIcon = document.querySelector("#github-icon");

let latestJson = "";

loadVersion();
loadGithubIcon(githubIcon);

async function loadVersion() {
  if (appVersion) {
    await renderVersionLabel(appVersion);
  }
}

toggleKeyButton.addEventListener("click", () => {
  const shouldShow = apiKeyInput.type === "password";
  apiKeyInput.type = shouldShow ? "text" : "password";
  toggleKeyButton.textContent = shouldShow ? "隐藏" : "显示";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const payload = {
    base_url: String(formData.get("base_url") || "").trim(),
    api_key: String(formData.get("api_key") || "").trim(),
    access_token: String(formData.get("access_token") || "").trim()
  };

  setStatus("loading", "查询中");
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    latestJson = JSON.stringify(data, null, 2);
    renderResult(data);

    if (response.ok && data.ok) {
      setStatus("success", "完成");
    } else {
      setStatus("error", data.status || "失败");
    }
  } catch (error) {
    const data = {
      ok: false,
      status: "network_error",
      error: {
        code: "network_error",
        message: error instanceof Error ? error.message : "request failed"
      }
    };
    latestJson = JSON.stringify(data, null, 2);
    renderResult(data);
    setStatus("error", "失败");
  } finally {
    submitButton.disabled = false;
  }
});

copyJsonButton.addEventListener("click", async () => {
  if (!latestJson) {
    return;
  }

  await navigator.clipboard.writeText(latestJson);
  copyJsonButton.textContent = "已复制";
  setTimeout(() => {
    copyJsonButton.textContent = "复制";
  }, 1200);
});

function renderResult(data) {
  emptyState.classList.add("hidden");
  resultView.classList.remove("hidden");
  jsonOutput.textContent = latestJson;
  jsonDetails.open = false;

  if (data.ok && data.result) {
    const result = data.result;
    summaryGrid.innerHTML = renderCoreMetrics(result);
    renderOtherMetrics(result);
    return;
  }

  otherDetails.classList.add("hidden");
  otherDetails.open = false;
  otherGrid.innerHTML = "";
  summaryGrid.innerHTML = [
    metric("状态", data.status || "failed", {
      valueState: hasDisplayValue(data.status) ? "has-value" : "empty-value",
      tone: "invalid"
    }),
    metric("错误", data.error?.message || "unknown error", {
      valueState: hasDisplayValue(data.error?.message) ? "has-value" : "empty-value",
      tone: "invalid"
    })
  ].join("");
}

function renderCoreMetrics(result) {
  const validity = getValidity(result);
  const platform = result.platform || result.provider || "未知平台";

  return `
    <div class="result-status-line">
      <strong>${escapeHtml(platform)}</strong>
      <span class="validity-text tone-${validity.tone}">${escapeHtml(validity.label)}</span>
    </div>
    <div class="remaining-row">
      ${metric("剩余额度", formatValue(result.remaining, result.unit), {
        valueState: getValueState(result.remaining),
        featured: true
      })}
    </div>
    <div class="summary-grid compact-summary-grid">
      ${[
        metric("总额", formatValue(result.balance, result.unit), {
          valueState: getValueState(result.balance)
        }),
        metric("已用", formatValue(result.used, result.unit), {
          valueState: getValueState(result.used)
        }),
        metric("到期时间", formatExpiry(result), {
          valueState:
            result.neverExpires || hasDisplayValue(result.expiresAt) ? "has-value" : "empty-value"
        })
      ].join("")}
    </div>
  `;
}

function renderOtherMetrics(result) {
  const details = [
    detailMetric("平台", result.platform || result.provider),
    detailMetric("模型", formatModels(result.models), result.models),
    detailMetric("Key 状态", result.status),
    detailMetric("Token 名称", result.tokenName),
    detailMetric("Source path", result.sourcePath),
    detailMetric("Provider", result.provider),
    detailMetric("5h 用量", formatValue(result.usageWindows?.usage5h, result.unit), result.usageWindows?.usage5h),
    detailMetric("1d 用量", formatValue(result.usageWindows?.usage1d, result.unit), result.usageWindows?.usage1d),
    detailMetric("7d 用量", formatValue(result.usageWindows?.usage7d, result.unit), result.usageWindows?.usage7d),
    detailMetric("5h 限制", formatValue(result.rateLimits?.rateLimit5h, result.unit), result.rateLimits?.rateLimit5h),
    detailMetric("1d 限制", formatValue(result.rateLimits?.rateLimit1d, result.unit), result.rateLimits?.rateLimit1d),
    detailMetric("7d 限制", formatValue(result.rateLimits?.rateLimit7d, result.unit), result.rateLimits?.rateLimit7d)
  ].filter(Boolean);

  otherDetails.open = false;

  if (details.length === 0) {
    otherDetails.classList.add("hidden");
    otherGrid.innerHTML = "";
    return;
  }

  otherDetails.classList.remove("hidden");
  otherGrid.innerHTML = details.join("");
}

function detailMetric(label, value, rawValue = value) {
  if (!hasDisplayValue(rawValue)) {
    return "";
  }

  return metric(label, value, {
    valueState: "has-value",
    detail: true
  });
}

function metric(label, value, options = {}) {
  const valueText = hasDisplayValue(value) ? String(value) : "未知";
  const classes = [
    "metric",
    options.detail ? "detail-metric" : "",
    options.featured ? "featured-metric" : "",
    options.valueState || getValueState(value),
    options.tone ? `tone-${options.tone}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `<div class="${classes}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    valueText
  )}</strong></div>`;
}

function formatValue(value, unit) {
  if (value === null || value === undefined) {
    return "未知";
  }

  const formatted = new Intl.NumberFormat("zh-CN").format(value);
  return unit && unit !== "unknown" && unit !== "quota" ? `${formatted} ${unit}` : formatted;
}

function getValidity(result) {
  const remaining = typeof result.remaining === "number" ? result.remaining : null;
  if (remaining === null) {
    return {
      label: "未知",
      tone: "unknown"
    };
  }

  if (remaining <= 0) {
    return {
      label: "无效",
      tone: "invalid"
    };
  }

  if (result.neverExpires) {
    return {
      label: "有效",
      tone: "valid"
    };
  }

  const expiresAtUnix =
    typeof result.expiresAtUnix === "number"
      ? result.expiresAtUnix
      : typeof result.expiresAtUnix === "string"
        ? Number(result.expiresAtUnix)
        : null;

  if (!Number.isFinite(expiresAtUnix)) {
    return {
      label: "未知",
      tone: "unknown"
    };
  }

  if (expiresAtUnix * 1000 <= Date.now()) {
    return {
      label: "无效",
      tone: "invalid"
    };
  }

  return {
    label: "有效",
    tone: "valid"
  };
}

function getValueState(value) {
  return hasDisplayValue(value) ? "has-value" : "empty-value";
}

function hasDisplayValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "未知" && value !== "未限制/未知";
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function formatExpiry(result) {
  if (result.neverExpires) {
    return "永不过期";
  }

  if (!result.expiresAt) {
    return "未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(result.expiresAt));
}

function formatModels(models) {
  if (!Array.isArray(models) || models.length === 0) {
    return "未限制/未知";
  }

  return models.join(", ");
}

function setStatus(kind, text) {
  statusPill.className = `mode-pill ${kind}`;
  statusPill.textContent = text;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
