import fs from "node:fs";
import path from "node:path";
import type { Connect, Plugin, ViteDevServer } from "vite";

type ChunkValue = string | number | boolean | Record<string, unknown> | null;

interface SourceChunk {
  id?: string | number;
  event?: string;
  data?: ChunkValue;
  delayMs?: number;
}

interface NormalizedChunk {
  id: string;
  event: string;
  data: ChunkValue;
  delayMs?: number;
}

interface ScenarioOptions {
  file: string;
  firstChunkDelayMs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
  disconnectAt: number;
  stallAfter: number;
  stallMs: number;
  httpErrorStatus: number;
  errorAt: number;
  errorMessage: string;
  malformedAt: number;
  duplicateAt: number;
  outOfOrder: boolean;
  heartbeatMs: number;
  includeDone: boolean;
  reconnect: boolean;
  lastEventId: string | null;
}

export type EndpointPattern = string | RegExp | (string | RegExp)[];

/**
 * Handler function type for TypeScript mock files.
 * Export `handler` from your `.ts` mock file to take full control of the response.
 *
 * @example
 * // mock/sessions.ts
 * import type { MockRequestHandler } from 'vite-plugin-ai-mock'
 *
 * export const handler: MockRequestHandler = (req, res) => {
 *   res.setHeader('Content-Type', 'application/json')
 *   res.end(JSON.stringify({ data: [] }))
 * }
 */
export type MockRequestHandler = (
  req: Connect.IncomingMessage,
  res: import("node:http").ServerResponse,
  next: Connect.NextFunction,
) => void | Promise<void>;

/**
 * The shape that a TypeScript mock module can export.
 *
 * Three patterns are supported:
 *
 * 1. `export default <data>` — static data, same as JSON
 * 2. `export default (req) => <data>` — factory called per request, supports async
 * 3. `export const handler = (req, res, next) => ...` — raw middleware, full control
 */
export interface MockModule {
  default?: unknown | ((req: Connect.IncomingMessage) => unknown | Promise<unknown>);
  handler?: MockRequestHandler;
}

export interface AiMockPluginOptions {
  dataDir?: string;
  endpoint?: EndpointPattern;
  /**
   * Default scenario configuration for all mock requests.
   * If set, all requests will use this scenario unless overridden by URL parameters.
   * @default undefined (uses 'normal' scenario with no preset)
   */
  defaultScenario?: DefaultScenarioConfig;
  /**
   * List of API paths that should return JSON format instead of SSE.
   * Supports string paths and RegExp patterns.
   * @example ['/api/chat/history', new RegExp('/api/config/.*')]
   */
  jsonApis?: (string | RegExp)[];
}

const AI_MOCK_BASE = "/api/ai/mock";

const SCENARIO_PRESETS = {
  normal: {},
  "first-delay": { firstChunkDelayMs: 1800 },
  jitter: { minIntervalMs: 80, maxIntervalMs: 1400 },
  disconnect: { disconnectAt: 3 },
  timeout: { stallAfter: 2, stallMs: 30_000 },
  error: { errorAt: 2, errorMessage: "mock_error" },
  malformed: { malformedAt: 2 },
  duplicate: { duplicateAt: 2 },
  "out-of-order": { outOfOrder: true },
  reconnect: { reconnect: true },
  heartbeat: { heartbeatMs: 2500 },
} as const;

export type ScenarioName = keyof typeof SCENARIO_PRESETS;

export interface DefaultScenarioConfig
  extends Partial<
    Omit<ScenarioOptions, "file" | "lastEventId" | "includeDone">
  > {
  scenario?: ScenarioName;
}

function clampPositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readJsonFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

function safeFileName(name: string): string {
  return name
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._\-/]/g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}

interface ResolvedDataFile {
  filePath: string;
  type: "json" | "ts";
}

function resolveDataFile(dataDir: string, fileName: string): ResolvedDataFile {
  const safeName = safeFileName(fileName) || "default";
  const absoluteDataDir = path.resolve(process.cwd(), dataDir);

  // Strip any explicit extension so we can try both
  const baseName = safeName.replace(/\.(json|ts)$/, "");

  const candidates: Array<{ filePath: string; type: "json" | "ts" }> = [
    // .ts takes priority so dynamic mock can shadow a JSON file
    { filePath: path.join(absoluteDataDir, `${baseName}.ts`), type: "ts" },
    { filePath: path.join(absoluteDataDir, `${baseName}.json`), type: "json" },
  ];

  // If user supplied an explicit extension, honour it and push it to the front
  if (safeName.endsWith(".ts")) {
    candidates.unshift({ filePath: path.join(absoluteDataDir, safeName), type: "ts" });
  } else if (safeName.endsWith(".json")) {
    candidates.unshift({ filePath: path.join(absoluteDataDir, safeName), type: "json" });
  }

  for (const candidate of candidates) {
    if (!candidate.filePath.startsWith(absoluteDataDir)) continue; // path traversal guard
    if (fs.existsSync(candidate.filePath)) return candidate;
  }

  throw new Error(
    `Mock data file not found: tried ${baseName}.ts and ${baseName}.json in "${dataDir}"`,
  );
}

/**
 * Load a TypeScript mock module via Vite's ssrLoadModule.
 *
 * Because ssrLoadModule goes through Vite's module graph, file changes are
 * automatically picked up on the next request — no server restart needed.
 */
async function loadTsMockModule(
  server: ViteDevServer,
  absoluteFilePath: string,
): Promise<MockModule> {
  // Invalidate so the latest version is always used
  const existingMod = server.moduleGraph.getModuleById(absoluteFilePath);
  if (existingMod) {
    server.moduleGraph.invalidateModule(existingMod);
  }

  // Build a URL that Vite's module resolver understands:
  // - files inside the vite root: relative URL  e.g. /mock/ai/sessions.ts
  // - files outside the root: use /@fs/ prefix
  const viteRoot = server.config.root;
  let moduleUrl: string;
  if (absoluteFilePath.startsWith(viteRoot)) {
    moduleUrl =
      "/" + path.relative(viteRoot, absoluteFilePath).replace(/\\/g, "/");
  } else {
    moduleUrl = "/@fs/" + absoluteFilePath;
  }

  return (await server.ssrLoadModule(moduleUrl)) as MockModule;
}

function normalizeChunks(raw: unknown): NormalizedChunk[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && "chunks" in raw
      ? (raw as { chunks: unknown }).chunks
      : [raw];

  if (!Array.isArray(source)) return [];

  return source.map((item, index) => {
    if (typeof item === "object" && item !== null) {
      const chunk = item as SourceChunk;
      return {
        id: String(chunk.id ?? index + 1),
        event: chunk.event ?? "message",
        data: chunk.data ?? null,
        delayMs: chunk.delayMs,
      };
    }

    return {
      id: String(index + 1),
      event: "message",
      data: item as ChunkValue,
    };
  });
}

function parseScenarioOptions(
  reqUrl: URL,
  lastEventIdHeader: string | undefined,
  defaultScenario?: DefaultScenarioConfig,
): ScenarioOptions {
  const params = reqUrl.searchParams;

  const presetName =
    (params.get("scenario") as ScenarioName | null) ??
    defaultScenario?.scenario;
  const preset = presetName ? (SCENARIO_PRESETS[presetName] ?? {}) : {};

  const getParam = (
    paramName: keyof ScenarioOptions,
    fallback: number | string | boolean,
  ): number | string | boolean => {
    const paramValue = params.get(String(paramName));
    if (paramValue !== null) {
      return typeof fallback === "number"
        ? clampPositiveInt(paramValue, fallback)
        : paramValue;
    }
    if (defaultScenario && paramName in defaultScenario) {
      return (
        defaultScenario[paramName as keyof DefaultScenarioConfig] ?? fallback
      );
    }
    const presetValue = (preset as Record<string, unknown>)[String(paramName)];
    if (presetValue !== undefined) {
      return presetValue as number | string | boolean;
    }
    return fallback;
  };

  const firstChunkDelayMs = getParam("firstChunkDelayMs", 0) as number;
  const minIntervalMs = getParam("minIntervalMs", 200) as number;
  const maxIntervalMs = getParam("maxIntervalMs", 700) as number;

  return {
    file: params.get("file") ?? "default",
    firstChunkDelayMs,
    minIntervalMs: Math.min(minIntervalMs, maxIntervalMs),
    maxIntervalMs: Math.max(minIntervalMs, maxIntervalMs),
    disconnectAt: getParam("disconnectAt", -1) as number,
    stallAfter: getParam("stallAfter", -1) as number,
    stallMs: getParam("stallMs", 30_000) as number,
    httpErrorStatus: clampPositiveInt(params.get("httpErrorStatus"), 0),
    errorAt: getParam("errorAt", -1) as number,
    errorMessage: getParam("errorMessage", "mock_error") as string,
    malformedAt: getParam("malformedAt", -1) as number,
    duplicateAt: getParam("duplicateAt", -1) as number,
    outOfOrder:
      params.get("outOfOrder") === "true" ||
      Boolean(defaultScenario?.outOfOrder) ||
      Boolean((preset as { outOfOrder?: boolean }).outOfOrder),
    heartbeatMs: getParam("heartbeatMs", 0) as number,
    includeDone: params.get("includeDone") !== "false",
    reconnect:
      params.get("reconnect") === "true" ||
      Boolean(defaultScenario?.reconnect) ||
      Boolean((preset as { reconnect?: boolean }).reconnect),
    lastEventId: params.get("lastEventId") ?? lastEventIdHeader ?? null,
  };
}

function getResumeIndex(
  chunks: NormalizedChunk[],
  lastEventId: string | null,
): number {
  if (!lastEventId) return 0;
  const hitIndex = chunks.findIndex((chunk) => chunk.id === lastEventId);
  return hitIndex >= 0 ? hitIndex + 1 : 0;
}

function applyChunkMutations(
  chunks: NormalizedChunk[],
  options: ScenarioOptions,
): NormalizedChunk[] {
  let result = chunks.map((item) => ({ ...item }));

  if (options.reconnect && options.lastEventId) {
    const startIndex = getResumeIndex(result, options.lastEventId);
    result = result.slice(startIndex);
  }

  if (options.outOfOrder && result.length > 2) {
    const swapped = [...result];
    const temp = swapped[1];
    swapped[1] = swapped[2];
    swapped[2] = temp;
    result = swapped;
  }

  if (options.duplicateAt > 0 && options.duplicateAt <= result.length) {
    const index = options.duplicateAt - 1;
    result.splice(index + 1, 0, {
      ...result[index],
      id: `${result[index].id}-dup`,
    });
  }

  return result;
}

function isJsonApi(pathname: string, jsonApis?: (string | RegExp)[]): boolean {
  if (!jsonApis || jsonApis.length === 0) return false;
  return jsonApis.some((pattern) => {
    if (typeof pattern === "string") {
      return pathname === pattern || pathname.startsWith(`${pattern}/`);
    }
    return pattern.test(pathname);
  });
}

function isSseRequest(reqUrl: URL, jsonApis?: (string | RegExp)[]): boolean {
  const transport = reqUrl.searchParams.get("transport");
  if (transport === "json") return false;
  if (transport === "sse") return true;
  if (isJsonApi(reqUrl.pathname, jsonApis)) return false;
  return true;
}

function writeSseEvent(
  res: { write: (chunk: string) => void },
  options: { id?: string; event?: string; data: unknown },
): void {
  if (options.id) res.write(`id: ${options.id}\n`);
  if (options.event && options.event !== "message")
    res.write(`event: ${options.event}\n`);

  const payload =
    typeof options.data === "string"
      ? options.data
      : JSON.stringify(options.data ?? null);
  const lines = payload.split("\n");
  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

interface EndpointMatchResult {
  fileFromPath: string;
}

function matchEndpoint(
  pathname: string,
  endpoint: EndpointPattern,
): EndpointMatchResult | null {
  if (Array.isArray(endpoint)) {
    for (const item of endpoint) {
      const result = matchEndpoint(pathname, item);
      if (result !== null) return result;
    }
    return null;
  }
  if (typeof endpoint === "string") {
    if (pathname === endpoint) return { fileFromPath: "" };
    if (pathname.startsWith(`${endpoint}/`))
      return { fileFromPath: pathname.slice(endpoint.length + 1) };
    return null;
  }
  return endpoint.test(pathname) ? { fileFromPath: "" } : null;
}

function streamChunks(
  req: Connect.IncomingMessage,
  res: import("node:http").ServerResponse,
  chunks: NormalizedChunk[],
  options: ScenarioOptions,
): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if ("flushHeaders" in res && typeof res.flushHeaders === "function") {
    (res as { flushHeaders: () => void }).flushHeaders();
  }

  let closed = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const pendingTimers = new Set<NodeJS.Timeout>();

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    for (const timer of pendingTimers) clearTimeout(timer);
    pendingTimers.clear();
  };

  req.on("close", cleanup);

  if (options.heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      if (closed) return;
      res.write(`: ping ${Date.now()}\n\n`);
    }, options.heartbeatMs);
  }

  const schedule = (task: () => void, delay: number) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer);
      task();
    }, delay);
    pendingTimers.add(timer);
  };

  const writeChunk = (chunk: NormalizedChunk, index: number) => {
    if (closed) return;
    const chunkNo = index + 1;

    if (options.disconnectAt === chunkNo) {
      cleanup();
      if ("destroy" in res && typeof res.destroy === "function") {
        (res as { destroy: () => void }).destroy();
        return;
      }
      res.end();
      return;
    }

    if (options.errorAt === chunkNo) {
      writeSseEvent(res, {
        id: chunk.id,
        event: "error",
        data: { message: options.errorMessage, at: chunkNo },
      });
      cleanup();
      res.end();
      return;
    }

    if (options.malformedAt === chunkNo) {
      res.write(`id: ${chunk.id}\n`);
      res.write("event: message\n");
      res.write('data: {"malformed": true\n\n');
    } else {
      writeSseEvent(res, {
        id: chunk.id,
        event: chunk.event,
        data: chunk.data,
      });
    }

    if (options.stallAfter === chunkNo) {
      schedule(() => {
        if (!closed) {
          cleanup();
          res.end();
        }
      }, options.stallMs);
      return;
    }

    const nextChunk = chunks[index + 1];
    if (!nextChunk) {
      if (options.includeDone) {
        writeSseEvent(res, { event: "done", data: { done: true } });
      }
      cleanup();
      res.end();
      return;
    }

    const interval =
      typeof nextChunk.delayMs === "number"
        ? nextChunk.delayMs
        : options.minIntervalMs +
          Math.floor(
            Math.random() *
              (options.maxIntervalMs - options.minIntervalMs + 1),
          );

    schedule(() => writeChunk(nextChunk, index + 1), interval);
  };

  if (chunks.length === 0) {
    if (options.includeDone) {
      writeSseEvent(res, { event: "done", data: { done: true } });
    }
    cleanup();
    res.end();
    return;
  }

  schedule(() => writeChunk(chunks[0], 0), options.firstChunkDelayMs);
}

export function aiMockPlugin(config?: AiMockPluginOptions): Plugin {
  const dataDir = config?.dataDir ?? "mock/ai";
  const endpoint: EndpointPattern = config?.endpoint ?? AI_MOCK_BASE;
  const defaultScenario = config?.defaultScenario;
  const jsonApis = config?.jsonApis;

  return {
    name: "vite-plugin-ai-mock",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const reqUrl = new URL(req.url, "http://localhost");
        const matched = matchEndpoint(reqUrl.pathname, endpoint);

        if (matched === null) return next();
        const fileFromPath = matched.fileFromPath;

        const lastEventIdHeader =
          typeof req.headers["last-event-id"] === "string"
            ? req.headers["last-event-id"]
            : undefined;

        const options = parseScenarioOptions(
          reqUrl,
          lastEventIdHeader,
          defaultScenario,
        );
        if (fileFromPath) options.file = fileFromPath;

        try {
          if (options.httpErrorStatus >= 400) {
            res.statusCode = options.httpErrorStatus;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: "http_error",
                status: options.httpErrorStatus,
              }),
            );
            return;
          }

          const resolved = resolveDataFile(dataDir, options.file);

          // ── TypeScript mock file ──────────────────────────────────────────
          if (resolved.type === "ts") {
            const mod = await loadTsMockModule(server, resolved.filePath);

            // Pattern 3: export const handler = (req, res, next) => ...
            if (typeof mod.handler === "function") {
              await mod.handler(req, res, next);
              return;
            }

            // Pattern 1 & 2: export default <data> | (req) => <data>
            if ("default" in mod) {
              const raw =
                typeof mod.default === "function"
                  ? await (mod.default as (req: Connect.IncomingMessage) => unknown)(req)
                  : mod.default;

              if (!isSseRequest(reqUrl, jsonApis)) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify(raw));
                return;
              }

              const chunks = applyChunkMutations(normalizeChunks(raw), options);
              streamChunks(req, res, chunks, options);
              return;
            }

            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(
              JSON.stringify({
                error: "mock_empty_module",
                message: `Mock file "${resolved.filePath}" must have a default export or a named "handler" export.`,
              }),
            );
            return;
          }

          // ── JSON mock file (original behaviour) ──────────────────────────
          const raw = readJsonFile(resolved.filePath);

          if (!isSseRequest(reqUrl, jsonApis)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(raw));
            return;
          }

          const chunks = applyChunkMutations(normalizeChunks(raw), options);
          streamChunks(req, res, chunks, options);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "mock_server_error",
              message:
                error instanceof Error ? error.message : "Unknown error",
            }),
          );
        }
      });
    },
  };
}
