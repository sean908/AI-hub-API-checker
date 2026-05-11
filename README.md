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

## 脚本

- `npm run dev`：启动 Wrangler 本地开发。
- `npm run typecheck`：TypeScript 类型检查。
- `npm run test`：运行测试。
- `npm run check`：类型检查和测试。
- `npm run deploy`：部署到 Cloudflare Workers。

## 当前支持

- New API：`GET /api/usage/token`。
- Sub2API：基于 Gateway API key 查询 `/v1/usage` 和 `/v1/models` 可见信息。
- Generic Probe：对少量常见余额/额度接口做探测，只在字段可明确识别时返回结构化结果。

Sub2API 仅使用页面输入的 API key，不要求 JWT。因此用户余额、订阅信息和完整 key 列表等 `/api/v1/*` 用户管理数据不在当前查询范围内。

## 部署

```bash
npm run deploy
```

私用部署需要在 Cloudflare Workers 中配置 `ACCESS_TOKEN` secret，并按需设置 `ACCESS_MODE`。
