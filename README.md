# vite-plugin-ai-mock

> English | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/vite-plugin-ai-mock?color=4fc08d)](https://www.npmjs.com/package/vite-plugin-ai-mock)
[![node version](https://img.shields.io/node/v/vite-plugin-ai-mock?color=4fc08d)](https://nodejs.org)
[![vite peer](https://img.shields.io/badge/vite-%3E%3D5.0.0-646cff)](https://vitejs.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/quanzhiyuan/vite-plugin-ai-mock/ci.yml?label=CI)](https://github.com/quanzhiyuan/vite-plugin-ai-mock/actions)
[![license](https://img.shields.io/npm/l/vite-plugin-ai-mock)](./LICENSE)

A standalone Vite plugin for AI scene mocking. Returns streaming data in JSON format, simulating various AI scenarios.

- Reads mock files from `mock/*.json`
- Returns SSE streaming response by default
- Use `?transport=json` to get JSON format response
- Supports 11 streaming scenarios with request parameters

## Install

```bash
pnpm add vite-plugin-ai-mock -D
```

## Usage

<table>
<tr>
<td width="35%" valign="top">

**Directory Structure**

```
project/
├── mock/
│   └── ai/
│       ├── chat.json
│       └── default.json
├── src/
└── vite.config.ts
```

**Request Example**

```ts
// SSE streaming (default)
const res = await fetch("/api/chat");
// JSON response
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
      endpoint: "/api", // /api/chat → chat.json
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

> 💡 See full examples: [examples](https://github.com/quanzhiyuan/vite-plugin-ai-mock/tree/main/examples) (includes Ant Design X, Assistant UI, Lobe Chat integrations)

## Scenarios (11)

1. Normal completion (default)
2. First chunk delay: `firstChunkDelayMs=1800` or `scenario=first-delay`
3. Jitter: `minIntervalMs=100&maxIntervalMs=1500` or `scenario=jitter`
4. Mid-stream disconnect: `disconnectAt=3` or `scenario=disconnect`
5. Timeout/no response: `stallAfter=2&stallMs=30000` or `scenario=timeout`
6. Stream error event: `errorAt=2&errorMessage=xxx` or `scenario=error`
7. Malformed chunk: `malformedAt=2` or `scenario=malformed`
8. Duplicate chunk: `duplicateAt=2` or `scenario=duplicate`
9. User cancel: client aborts request (server handles `close`)
10. Reconnect/resume: `reconnect=true&lastEventId=1` or `scenario=reconnect`
11. Heartbeat: `heartbeatMs=2500` or `scenario=heartbeat`

Extra:

- HTTP error injection: `httpErrorStatus=401`
- Skip done event: `includeDone=false`

## Scenario Configuration

Scenarios can be configured in two ways, in order of precedence:

**1. URL parameters (per-request)**

Append parameters directly to the request URL, useful for debugging a single endpoint:

```
/api/default?scenario=jitter
/api/default?firstChunkDelayMs=1000&errorAt=3
```

```ts
// Default returns SSE streaming response
const response = await fetch("/api/default?firstChunkDelayMs=4800", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});

// Use ?transport=json to get JSON format
const jsonResponse = await fetch("/api/default?transport=json");
```

**2. Plugin option `defaultScenario` (global)**

Configure in `vite.config.ts` to apply to all mock requests. URL parameters take precedence and override this:

```ts
aiMockPlugin({
  defaultScenario: {
    scenario: "jitter", // Use a preset scenario name
    // Individual options override the preset's corresponding values:
    firstChunkDelayMs: 500,
    minIntervalMs: 100,
    maxIntervalMs: 800,
    errorAt: 3,
    errorMessage: "custom_error",
  },
});
```

When `defaultScenario` is not set, the `normal` scenario is used (no delay, completes normally).

**3. Plugin option `jsonApis` (specify JSON-returning APIs)**

Configure in `vite.config.ts` to specify which API paths should return JSON format instead of SSE:

```ts
aiMockPlugin({
  endpoint: "/api",
  jsonApis: [
    "/api/config", // exact match
    "/api/history", // exact match
    /^\/api\/static\/.*/, // regex match
  ],
});
```

Precedence: `?transport=json` / `?transport=sse` > `jsonApis` config > default SSE

## Mock file format

Each file is a JSON object with a `chunks` array. Every chunk maps to one SSE event:

| Field     | Type   | Description                                                     |
| --------- | ------ | --------------------------------------------------------------- |
| `id`      | string | SSE `id:` field, used for reconnect resume                      |
| `event`   | string | SSE `event:` field (default: `message`)                         |
| `data`    | any    | Payload — object/array is JSON-serialized, string is sent as-is |
| `delayMs` | number | Per-chunk delay override (ms)                                   |

`default.json` is loaded when no file is specified. You can customize it with any `data` shape to match your own API format:

```json
{
  "chunks": [
    { "id": "1", "event": "message", "data": { "delta": "Hello" } },
    { "id": "2", "event": "message", "data": { "delta": ", " } },
    { "id": "3", "event": "message", "data": { "delta": "world!" } }
  ]
}
```

### Real-world format examples

The `data` field can mirror any real API response. The package ships with ready-to-use examples in `mock/` — copy them into your project as a starting point:

| File                        | Provider            |
| --------------------------- | ------------------- |
| `mock/openai.json`          | OpenAI / compatible |
| `mock/claude.json`          | Anthropic Claude    |
| `mock/gemini.json`          | Google Gemini       |
| `mock/deepseek.json`        | DeepSeek            |
| `mock/deepseek-reasoner.json` | DeepSeek Reasoner |
| `mock/qwen.json`            | Qwen (Alibaba)      |
| `mock/qwen-thinking.json`   | Qwen Thinking       |
| `mock/doubao.json`          | Doubao (ByteDance)  |

**OpenAI / compatible** (`openai.json`) — `data` ends with `"[DONE]"` string:

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

**Anthropic Claude** (`claude.json`) — uses distinct `event` types:

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

**Google Gemini** (`gemini.json`) — all events share the same `message` event type:

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

**AI SDK `useChat`** — compatible with `@ai-sdk/react` `useChat` hook:

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

Usage with `useChat`:

```tsx
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/chat",
  }),
});
```

## Endpoint

`endpoint` accepts a `string`, `RegExp`, or `(string | RegExp)[]`.

| Type                   | `fileFromPath` extraction                                          |
| ---------------------- | ------------------------------------------------------------------ |
| `string`               | Strips the path prefix                                             |
| `RegExp`               | Always `""`, relies on `?file=`                                    |
| `(string \| RegExp)[]` | Tries each in order; first match wins and follows its type's rules |

```ts
// string (default)
endpoint: "/api";
// /api              → file = "default"
// /api/chat         → file = "chat"
// /api/i18n/zh-CN   → file = "i18n/zh-CN" (nested directory)

// RegExp
endpoint: /^\/api\/ai\/.*/;
// relies on ?file= to pick the mock file

// array
endpoint: ["/api/chat", /^\/v2\/ai\/.*/];
```

Nested directories are supported. For example, `/api/i18n/zh-CN` maps to `mock/i18n/zh-CN.json`.

- `/api`
- `/api/<file>`
- `/api/<dir>/<file>` (nested)
- `?file=<file>` or `?file=<dir>/<file>`

## Test

```bash
pnpm test
```

## Build

```bash
pnpm build
```

## Publish

```bash
pnpm release:npm
```

`prepublishOnly` will automatically run build, tests and typecheck.

## Configuration Options

### Plugin Options `AiMockPluginOptions`

| Option            | Type                                       | Default          | Description                                                     |
| ----------------- | ------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| `dataDir`         | `string`                                   | `"mock"`         | Directory for mock files, relative to project root              |
| `endpoint`        | `string \| RegExp \| (string \| RegExp)[]` | `"/api"`         | API path to intercept, supports string, RegExp, or array        |
| `defaultScenario` | `DefaultScenarioConfig`                    | `undefined`      | Global default scenario config, can be overridden by URL params |
| `jsonApis`        | `(string \| RegExp)[]`                     | `undefined`      | List of API paths that should return JSON format                |

### Scenario Config `DefaultScenarioConfig`

| Option              | Type           | Default        | Description                                                                                                                                                   |
| ------------------- | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario`          | `ScenarioName` | `undefined`    | Preset scenario name: `normal`, `first-delay`, `jitter`, `disconnect`, `timeout`, `error`, `malformed`, `duplicate`, `out-of-order`, `reconnect`, `heartbeat` |
| `firstChunkDelayMs` | `number`       | `0`            | Delay before sending first chunk (ms)                                                                                                                         |
| `minIntervalMs`     | `number`       | `200`          | Minimum interval between chunks (ms)                                                                                                                          |
| `maxIntervalMs`     | `number`       | `700`          | Maximum interval between chunks (ms)                                                                                                                          |
| `disconnectAt`      | `number`       | `-1`           | Disconnect at chunk N (-1 to disable)                                                                                                                         |
| `stallAfter`        | `number`       | `-1`           | Stop sending after chunk N (-1 to disable)                                                                                                                    |
| `stallMs`           | `number`       | `30000`        | Wait time after stalling (ms)                                                                                                                                 |
| `errorAt`           | `number`       | `-1`           | Send error event at chunk N (-1 to disable)                                                                                                                   |
| `errorMessage`      | `string`       | `"mock_error"` | Error event message content                                                                                                                                   |
| `malformedAt`       | `number`       | `-1`           | Send malformed data at chunk N (-1 to disable)                                                                                                                |
| `duplicateAt`       | `number`       | `-1`           | Send duplicate chunk at N (-1 to disable)                                                                                                                     |
| `outOfOrder`        | `boolean`      | `false`        | Shuffle chunk order (swaps chunks 2 and 3)                                                                                                                    |
| `heartbeatMs`       | `number`       | `0`            | Heartbeat interval (ms), 0 to disable                                                                                                                         |
| `reconnect`         | `boolean`      | `false`        | Enable reconnect mode, use with `lastEventId`                                                                                                                 |

### URL Parameters

In addition to scenario config params, the following URL-only params are supported:

| Param             | Type                | Default     | Description                                                  |
| ----------------- | ------------------- | ----------- | ------------------------------------------------------------ |
| `file`            | `string`            | `"default"` | Mock file name (without `.json` extension)                   |
| `transport`       | `"sse" \| "json"`   | `"sse"`     | Response format: `sse` for streaming, `json` for direct JSON |
| `httpErrorStatus` | `number`            | `0`         | Return specified HTTP error status (e.g., 401, 500)          |
| `includeDone`     | `"true" \| "false"` | `"true"`    | Whether to send `done` event at stream end                   |
| `lastEventId`     | `string`            | `undefined` | Last event ID for reconnection, resumes after this ID        |

### Full Configuration Example

```ts
import { defineConfig } from "vite";
import { aiMockPlugin } from "vite-plugin-ai-mock";

export default defineConfig({
  plugins: [
    aiMockPlugin({
      // Mock file directory
      dataDir: "mock",
      // API path to intercept
      endpoint: "/api",
      // Global default scenario
      defaultScenario: {
        scenario: "jitter",
        firstChunkDelayMs: 500,
        minIntervalMs: 100,
        maxIntervalMs: 800,
      },
      // APIs that return JSON format
      jsonApis: ["/api/config", /^\/api\/static\/.*/],
    }),
  ],
});
```
