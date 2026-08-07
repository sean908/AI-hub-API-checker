# AI API Key Checker

Cloudflare Workers Web 工具，用于查询 AI API 中转站 key 的余额、用量、到期时间和模型限制。

## 本地开发

```bash
npm install
npm run dev
```

私用模式下需要创建 `.dev.vars`：

```env
ACCESS_MODE=private
ACCESS_TOKEN=change-me
REQUEST_TIMEOUT_MS=10000
GITHUB_ICON_URLS="https://example.com/icon-a.png
https://example.com/icon-b.svg"
```

如果要公开使用：

```env
ACCESS_MODE=public
REQUEST_TIMEOUT_MS=10000
```

也可以从示例文件复制：

```bash
cp .dev.vars.example .dev.vars
```

`GITHUB_ICON_URLS` 使用换行分隔的 Text 值。正式部署时在 Cloudflare Worker 的 Variables 中配置该变量；`npm run deploy` 会使用 `--keep-vars` 保留 Dashboard 中的变量，不会把图标 URL 写入仓库或命令行参数。

## 脚本

- `npm run dev`：启动 Wrangler 本地开发，并注入当前 `package.json` 版本和 Git SHA。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run test`：运行测试。
- `npm run check`：类型检查和测试。
- `npm run deploy`：确认工作区干净后，注入版本和 Git SHA 并部署到 Cloudflare Workers。

`npm run dev` 在存在未提交项目变更时会将 SHA 显示为 `<short-sha>-dirty`。正式部署会拒绝任何已跟踪、已暂存或未跟踪的项目变更；`.wrangler/`、`node_modules/` 和本地变量文件会被忽略。

## 当前支持

- New API：`GET /api/usage/token`。
- Sub2API：基于 Gateway API key 查询 `/v1/usage` 和 `/v1/models` 可见信息。
- Generic Probe：对少量常见余额/额度接口做探测，只在字段可明确识别时返回结构化结果。

三类已识别 provider 在验证成功后都会尝试 OpenAI 兼容的 models endpoint（`/v1/models` 或 `/models`），获取该 API Key 可见的模型列表写入 `result.models`。模型发现失败不影响已验证的额度检测：`/api/check` 仍返回 `ok: true` 和原有余额/用量数据，此时 `models` 为空数组，模型请求的 `attempt` 会记录 `not_matched`/`auth_failed`/`upstream_error` 之一。

`result.modelLimits` 仅承载上游明确提供的 Token 限制（New API 的 `data.model_limits` 等字面 `model_limits` 字段），不会从模糊的 `models` 字段推断；上游未提供时该字段省略。

Sub2API 仅使用页面输入的 API key，不要求 JWT。因此用户余额、订阅信息和完整 key 列表等 `/api/v1/*` 用户管理数据不在当前查询范围内。

Sub2API 的 `/v1/usage` 与 `/v1/models` 是网关代理端点，可能把额外请求转发到上游模型服务。usage 验证成功后会继续请求一次 OpenAI 兼容的 models endpoint；当 Base URL 已以 `/v1` 结尾时请求 `/models`，否则请求 `/v1/models`，并将发现的模型与 usage 结果合并。模型发现失败不会覆盖已验证的额度/用量，`result.models` 会保持为空。只有 usage 未匹配时，models endpoint 才作为 Sub2API provider 的回退识别路径。

## 部署

```bash
npm run deploy
```

私用部署需要在 Cloudflare Workers 中配置 `ACCESS_TOKEN` secret，并按需设置 `ACCESS_MODE`。

Worker 提供公开的 GitHub 图标配置接口：

```bash
WORKER_URL="https://your-worker.example.com"
curl -fsSL "$WORKER_URL/api/config"
```

接口返回经过协议过滤的 `githubIconUrls`。页面有自定义 URL 时只从该列表随机加载；没有有效配置或接口不可用时，从内置的 3 个 GitHub 通用图标中随机选择。

## 版本确认

Worker 提供公开的版本接口，不需要访问码：

```bash
WORKER_URL="https://your-worker.example.com"
curl -fsSL "$WORKER_URL/api/version"
```

接口会返回语义版本、完整 `buildSha` 和 7 位 `shortSha`。确认线上版本是否对应当前本地 commit：

```bash
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(curl -fsSL "$WORKER_URL/api/version" | jq -r .buildSha)

test "$LOCAL_SHA" = "$REMOTE_SHA" \
  && echo "MATCH: $REMOTE_SHA" \
  || echo "MISMATCH: local=$LOCAL_SHA remote=$REMOTE_SHA"
```

左侧面板的 `AI API Hub` 后面会显示 `(v<版本> · <短 SHA>)`。如果接口不可用或版本没有注入，显示 `(版本未知)`，不影响查询功能。
