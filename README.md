# vite-plugin-ai-mock

> English | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/vite-plugin-ai-mock?color=4fc08d)](https://www.npmjs.com/package/vite-plugin-ai-mock)
[![node version](https://img.shields.io/node/v/vite-plugin-ai-mock?color=4fc08d)](https://nodejs.org)
[![vite peer](https://img.shields.io/badge/vite-%3E%3D5.0.0-646cff)](https://vitejs.dev)
[![CI](https://img.shields.io/github/actions/workflow/status/quanzhiyuan/vite-plugin-ai-mock/ci.yml?label=CI)](https://github.com/quanzhiyuan/vite-plugin-ai-mock/actions)
[![license](https://img.shields.io/npm/l/vite-plugin-ai-mock)](./LICENSE)

A standalone Vite plugin for AI scene mocking. Returns streaming data in JSON format, simulating various AI scenarios.

- Reads mock files from `mock/ai/*.json`
- Auto returns SSE when request is SSE (`Accept: text/event-stream` or `?transport=sse`)
- Returns JSON for non-SSE calls
- Supports 11 streaming scenarios with request parameters

## Install

```bash
npm i vite-plugin-ai-mock -D
```

## Usage

```ts
import { defineConfig } from "vite";
import { aiMockPlugin } from "vite-plugin-ai-mock";

export default defineConfig({
  plugins: [
    aiMockPlugin({
      dataDir: "mock/ai",
      endpoint: "/api/ai/mock",
    }),
  ],
});
```

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
/api/ai/mock/default?scenario=jitter
/api/ai/mock/default?firstChunkDelayMs=1000&errorAt=3
```

```ts
const response = await fetch("/api/ai/mock/default?firstChunkDelayMs=4800", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body: JSON.stringify({}),
});
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

The `data` field can mirror any real API response. The package ships with ready-to-use examples in `mock/ai/` — copy them into your project as a starting point:

| File | Provider |
| --- | --- |
| `mock/ai/openai.json` | OpenAI / compatible |
| `mock/ai/claude.json` | Anthropic Claude |
| `mock/ai/gemini.json` | Google Gemini |
| `mock/ai/deepseek.json` | DeepSeek |
| `mock/ai/deepseek-reasoner.json` | DeepSeek Reasoner |
| `mock/ai/qwen.json` | Qwen (Alibaba) |
| `mock/ai/qwen-thinking.json` | Qwen Thinking |
| `mock/ai/doubao.json` | Doubao (ByteDance) |

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

## Endpoint

`endpoint` accepts a `string`, `RegExp`, or `(string | RegExp)[]`.

| Type                   | `fileFromPath` extraction                                          |
| ---------------------- | ------------------------------------------------------------------ |
| `string`               | Strips the path prefix                                             |
| `RegExp`               | Always `""`, relies on `?file=`                                    |
| `(string \| RegExp)[]` | Tries each in order; first match wins and follows its type's rules |

```ts
// string (default)
endpoint: "/api/ai/mock";
// /api/ai/mock        → file = "default"
// /api/ai/mock/chat   → file = "chat"
// /api/ai/mock/deepseek   → file = "deepseek"

// RegExp
endpoint: /^\/api\/ai\/.*/;
// relies on ?file= to pick the mock file

// array
endpoint: ["/api/chat", /^\/v2\/ai\/.*/];
```

- `/api/ai/mock`
- `/api/ai/mock/<file>`
- `?file=<file>`

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

## Publish

```bash
npm run release:npm
```

`prepublishOnly` will automatically run build, tests and typecheck..
