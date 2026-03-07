# vite-plugin-ai-mock

一个用于 AI 场景模拟的独立 Vite 插件。可以返回 JSON 格式的流式数据，模拟不同的 AI 场景。

> [English](./README.md) | 中文

- 从 `mock/*.json` 读取 mock 文件
- 默认返回 SSE 流式响应
- 使用 `?transport=json` 获取 JSON 格式响应
- 支持 11 种流式场景，通过请求参数控制

## 安装

```bash
pnpm add vite-plugin-ai-mock -D
```

## 使用

<table>
<tr>
<td width="35%" valign="top">

**目录结构**

```
project/
├── mock/
│   └── ai/
│       ├── chat.json
│       └── default.json
├── src/
└── vite.config.ts
```

**请求示例**

```ts
// SSE 流式响应（默认）
const res = await fetch("/api/chat");
// JSON 响应
const json = await fetch("/api/chat?transport=json");
```

</td>
<td width="65%" valign="top">

**vite.config.ts**

```ts
import { defineConfig } from "vite";
import { aiMockPlugin } from "vite-plugin-ai-mock";

export default defineConfig({
  plugins: [
    aiMockPlugin({
      dataDir: "mock",
      endpoint: "/api",  // /api/chat → chat.json
    }),
  ],
});
```

**mock/chat.json**

```json
{
  "chunks": [
    { "id": "1", "data": { "type": "start" } },
    { "id": "2", "data": { "type": "text-delta", "delta": "Hello" } },
    { "id": "3", "data": { "type": "text-delta", "delta": " World!" } },
    { "id": "4", "data": { "type": "finish" } }
  ]
}
```

</td>
</tr>
</table>

> 💡 查看完整示例：[examples](https://github.com/quanzhiyuan/vite-plugin-ai-mock/tree/main/examples)（包含 Ant Design X、Assistant UI、Lobe Chat 等集成示例）

## 场景（11 种）

1. 正常完成（默认）
2. 首包延迟：`firstChunkDelayMs=1800` 或 `scenario=first-delay`
3. 抖动：`minIntervalMs=100&maxIntervalMs=1500` 或 `scenario=jitter`
4. 中途断开：`disconnectAt=3` 或 `scenario=disconnect`
5. 超时/无响应：`stallAfter=2&stallMs=30000` 或 `scenario=timeout`
6. 流错误事件：`errorAt=2&errorMessage=xxx` 或 `scenario=error`
7. 格式错误的数据块：`malformedAt=2` 或 `scenario=malformed`
8. 重复数据块：`duplicateAt=2` 或 `scenario=duplicate`
9. 用户取消：客户端中止请求（服务端处理 `close`）
10. 重连/续传：`reconnect=true&lastEventId=1` 或 `scenario=reconnect`
11. 心跳：`heartbeatMs=2500` 或 `scenario=heartbeat`

额外参数：

- HTTP 错误注入：`httpErrorStatus=401`
- 跳过完成事件：`includeDone=false`

## 场景配置

场景有两种配置方式，优先级由高到低：

**1. URL 参数（仅对当前请求生效）**

直接在请求 URL 上附加参数，适合临时调试单个接口：

```
/api/default?scenario=jitter
/api/default?firstChunkDelayMs=1000&errorAt=3
```

```ts
// 默认返回 SSE 流式响应
const response = await fetch("/api/default?firstChunkDelayMs=4800", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});

// 使用 ?transport=json 获取 JSON 格式
const jsonResponse = await fetch("/api/default?transport=json");
```

**2. 插件选项 `defaultScenario`（全局生效）**

在 `vite.config.ts` 中配置，对所有 mock 请求生效，可被 URL 参数覆盖：

```ts
aiMockPlugin({
  defaultScenario: {
    scenario: "jitter", // 使用预设场景名
    // 也可单独配置参数，会覆盖预设场景的对应值：
    firstChunkDelayMs: 500,
    minIntervalMs: 100,
    maxIntervalMs: 800,
    errorAt: 3,
    errorMessage: "custom_error",
  },
});
```

不配置 `defaultScenario` 时，默认使用 `normal` 场景（无延迟，正常完成）。

**3. 插件选项 `jsonApis`（指定返回 JSON 格式的 API）**

在 `vite.config.ts` 中配置，指定哪些 API 路径返回 JSON 格式而不是 SSE 格式：

```ts
aiMockPlugin({
  endpoint: "/api",
  jsonApis: [
    "/api/config",           // 精确匹配
    "/api/history",          // 精确匹配
    /^\/api\/static\/.*/,    // 正则匹配
  ],
});
```

优先级：`?transport=json` / `?transport=sse` > `jsonApis` 配置 > 默认 SSE

## Mock 文件格式

每个文件是一个包含 `chunks` 数组的 JSON 对象，每个 chunk 对应一条 SSE 事件：

| 字段      | 类型   | 说明                                                |
| --------- | ------ | --------------------------------------------------- |
| `id`      | string | SSE `id:` 字段，用于断线重连续传                    |
| `event`   | string | SSE `event:` 字段（默认：`message`）                |
| `data`    | any    | 数据载体——对象/数组会被 JSON 序列化，字符串原样发送 |
| `delayMs` | number | 单个 chunk 的延迟时间覆盖（毫秒）                   |

`default.json` 是未指定文件时加载的默认文件，`data` 字段可自由定义，用于匹配你自己的 API 格式：

```json
{
  "chunks": [
    { "id": "1", "event": "message", "data": { "delta": "Hello" } },
    { "id": "2", "event": "message", "data": { "delta": ", " } },
    { "id": "3", "event": "message", "data": { "delta": "world!" } }
  ]
}
```

### 主流格式示例

`data` 字段可以完整模拟真实 API 的响应结构。npm 包内置了以下示例文件（位于 `mock/`），可直接复制到项目中使用：

| 文件                        | 提供商            |
| --------------------------- | ----------------- |
| `mock/openai.json`          | OpenAI / 兼容格式 |
| `mock/claude.json`          | Anthropic Claude  |
| `mock/gemini.json`          | Google Gemini     |
| `mock/deepseek.json`        | DeepSeek          |
| `mock/deepseek-reasoner.json` | DeepSeek Reasoner |
| `mock/qwen.json`            | 通义千问（阿里）  |
| `mock/qwen-thinking.json`   | 通义千问 Thinking |
| `mock/doubao.json`          | 豆包（字节跳动）  |

**OpenAI / 兼容格式**（`openai.json`）——最后一条 `data` 为字符串 `"[DONE]"`：

```json
{
  "id": "1",
  "event": "message",
  "data": {
    "id": "chatcmpl-001",
    "object": "chat.completion.chunk",
    "choices": [
      { "index": 0, "delta": { "content": "Hello" }, "finish_reason": null }
    ]
  }
}
```

**Anthropic Claude**（`claude.json`）——通过不同 `event` 类型区分生命周期：

```json
{
  "id": "3",
  "event": "content_block_delta",
  "data": {
    "type": "content_block_delta",
    "index": 0,
    "delta": { "type": "text_delta", "text": "Hello" }
  }
}
```

**Google Gemini**（`gemini.json`）——所有事件统一使用 `message` 事件类型：

```json
{
  "id": "1",
  "event": "message",
  "data": {
    "candidates": [
      {
        "content": { "parts": [{ "text": "Hello" }], "role": "model" },
        "finishReason": null
      }
    ]
  }
}
```

**AI SDK `useChat`**——兼容 `@ai-sdk/react` 的 `useChat` hook：

```json
{
  "chunks": [
    { "id": "1", "event": "message", "data": { "type": "start" } },
    {
      "id": "2",
      "event": "message",
      "data": { "type": "text-start", "id": "t1" }
    },
    {
      "id": "3",
      "event": "message",
      "data": { "type": "text-delta", "id": "t1", "delta": "Hello" }
    },
    {
      "id": "4",
      "event": "message",
      "data": { "type": "text-delta", "id": "t1", "delta": ", world!" }
    },
    {
      "id": "5",
      "event": "message",
      "data": { "type": "text-end", "id": "t1" }
    },
    {
      "id": "6",
      "event": "message",
      "data": { "type": "finish", "finishReason": "stop" }
    }
  ]
}
```

配合 `useChat` 使用：

```tsx
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/chat",
  }),
});
```

## 接口地址

`endpoint` 支持 `string`、`RegExp` 或 `(string | RegExp)[]`。

| 类型                   | `fileFromPath` 提取方式                |
| ---------------------- | -------------------------------------- |
| `string`               | 去掉路径前缀                           |
| `RegExp`               | 始终为 `""`，依赖 `?file=` 参数        |
| `(string \| RegExp)[]` | 按序匹配，第一个命中者按其类型规则处理 |

```ts
// string（默认）
endpoint: "/api";
// /api              → file = "default"
// /api/chat         → file = "chat"
// /api/i18n/zh-CN   → file = "i18n/zh-CN"（多层级目录）

// RegExp
endpoint: /^\/api\/ai\/.*/;
// 依赖 ?file= 参数选取 mock 文件

// 数组
endpoint: ["/api/chat", /^\/v2\/ai\/.*/];
```

支持多层级目录。例如 `/api/i18n/zh-CN` 会映射到 `mock/i18n/zh-CN.json`。

- `/api`
- `/api/<file>`
- `/api/<dir>/<file>`（多层级）
- `?file=<file>` 或 `?file=<dir>/<file>`

## 测试

```bash
pnpm test
```

## 构建

```bash
pnpm build
```

## 发布

```bash
pnpm release:npm
```

`prepublishOnly` 会自动执行构建、测试和类型检查。

## 配置选项

### 插件配置 `AiMockPluginOptions`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `dataDir` | `string` | `"mock"` | mock 文件所在目录，相对于项目根目录 |
| `endpoint` | `string \| RegExp \| (string \| RegExp)[]` | `"/api"` | 拦截的 API 路径，支持字符串、正则或数组 |
| `defaultScenario` | `DefaultScenarioConfig` | `undefined` | 全局默认场景配置，可被 URL 参数覆盖 |
| `jsonApis` | `(string \| RegExp)[]` | `undefined` | 指定返回 JSON 格式的 API 路径列表 |

### 场景配置 `DefaultScenarioConfig`

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `scenario` | `ScenarioName` | `undefined` | 预设场景名：`normal`、`first-delay`、`jitter`、`disconnect`、`timeout`、`error`、`malformed`、`duplicate`、`out-of-order`、`reconnect`、`heartbeat` |
| `firstChunkDelayMs` | `number` | `0` | 首个数据块发送前的延迟时间（毫秒） |
| `minIntervalMs` | `number` | `200` | 数据块之间的最小间隔时间（毫秒） |
| `maxIntervalMs` | `number` | `700` | 数据块之间的最大间隔时间（毫秒） |
| `disconnectAt` | `number` | `-1` | 在第 N 个数据块处断开连接（-1 为不断开） |
| `stallAfter` | `number` | `-1` | 在第 N 个数据块后停止发送（-1 为不停止） |
| `stallMs` | `number` | `30000` | 停止发送后等待的时间（毫秒） |
| `errorAt` | `number` | `-1` | 在第 N 个数据块处发送错误事件（-1 为不发送） |
| `errorMessage` | `string` | `"mock_error"` | 错误事件的消息内容 |
| `malformedAt` | `number` | `-1` | 在第 N 个数据块处发送格式错误的数据（-1 为不发送） |
| `duplicateAt` | `number` | `-1` | 在第 N 个数据块处发送重复数据（-1 为不发送） |
| `outOfOrder` | `boolean` | `false` | 是否打乱数据块顺序（交换第 2、3 块） |
| `heartbeatMs` | `number` | `0` | 心跳间隔时间（毫秒），0 为不发送心跳 |
| `reconnect` | `boolean` | `false` | 是否启用重连模式，配合 `lastEventId` 使用 |

### URL 参数

除了上述场景配置参数外，还支持以下 URL 专用参数：

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `file` | `string` | `"default"` | 指定 mock 文件名（不含 `.json` 后缀） |
| `transport` | `"sse" \| "json"` | `"sse"` | 响应格式：`sse` 流式响应，`json` 直接返回 JSON |
| `httpErrorStatus` | `number` | `0` | 返回指定 HTTP 状态码错误（如 401、500） |
| `includeDone` | `"true" \| "false"` | `"true"` | 是否在流结束时发送 `done` 事件 |
| `lastEventId` | `string` | `undefined` | 断线重连时的最后事件 ID，从该 ID 之后继续发送 |

### 完整配置示例

```ts
import { defineConfig } from "vite";
import { aiMockPlugin } from "vite-plugin-ai-mock";

export default defineConfig({
  plugins: [
    aiMockPlugin({
      // mock 文件目录
      dataDir: "mock",
      // 拦截的 API 路径
      endpoint: "/api",
      // 全局默认场景
      defaultScenario: {
        scenario: "jitter",
        firstChunkDelayMs: 500,
        minIntervalMs: 100,
        maxIntervalMs: 800,
      },
      // 返回 JSON 格式的 API 列表
      jsonApis: [
        "/api/config",
        /^\/api\/static\/.*/,
      ],
    }),
  ],
});
```
