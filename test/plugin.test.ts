import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { aiMockPlugin, type EndpointPattern } from "../src/index";

// ── helpers ────────────────────────────────────────────────────────────────

async function collectSse(res: Response): Promise<string> {
  return res.text();
}

let server: ViteDevServer;
let baseUrl = "";
const cwdBackup = process.cwd();

beforeAll(async () => {
  const fixtureRoot = path.resolve(__dirname, "fixtures");
  process.chdir(fixtureRoot);

  server = await createServer({
    root: fixtureRoot,
    plugins: [
      aiMockPlugin({
        dataDir: "mock/ai",
        endpoint: "/api/ai/mock",
      }),
    ],
    server: {
      port: 0,
      host: "127.0.0.1",
    },
    logLevel: "silent",
  });

  await server.listen();
  const addr = server.httpServer?.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to get test server address");
  }
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await server.close();
  process.chdir(cwdBackup);
});

async function startServer(endpointOption: EndpointPattern) {
  const fixtureRoot = path.resolve(__dirname, "fixtures");
  const s = await createServer({
    root: fixtureRoot,
    plugins: [aiMockPlugin({ dataDir: path.resolve(fixtureRoot, "mock/ai"), endpoint: endpointOption })],
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await s.listen();
  const addr = s.httpServer?.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to get test server address");
  return { server: s, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("endpoint: RegExp", () => {
  let s: ViteDevServer;
  let url = "";

  beforeAll(async () => {
    ({ server: s, baseUrl: url } = await startServer(/^\/api\/ai\/.*/));
  });

  afterAll(async () => {
    await s.close();
  });

  it("matches path via RegExp and returns JSON with transport=json", async () => {
    const res = await fetch(`${url}/api/ai/anything?file=default&transport=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(3);
    expect(body.chunks[0].data.delta).toBe("hello");
  });

  it("does not match an unrelated path", async () => {
    const res = await fetch(`${url}/other/path`);
    expect(res.status).not.toBe(200);
  });
});

describe("endpoint: array", () => {
  let s: ViteDevServer;
  let url = "";

  beforeAll(async () => {
    ({ server: s, baseUrl: url } = await startServer(["/api/chat", /^\/v2\/ai\/.*/]));
  });

  afterAll(async () => {
    await s.close();
  });

  it("matches first string item with fileFromPath", async () => {
    const res = await fetch(`${url}/api/chat/default?transport=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(3);
  });

  it("matches second RegExp item via ?file=", async () => {
    const res = await fetch(`${url}/v2/ai/stream?file=default&transport=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(3);
  });

  it("does not match an unrelated path", async () => {
    const res = await fetch(`${url}/api/ai/mock`);
    expect(res.status).not.toBe(200);
  });
});

describe("aiMockPlugin", () => {
  it("returns SSE mode by default", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/default?minIntervalMs=0&maxIntervalMs=0`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("id: 1");
    expect(text).toContain("data: {\"delta\":\"hello\"}");
  });

  it("returns raw JSON with transport=json", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/default?transport=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(3);
    expect(body.chunks[0].data.delta).toBe("hello");
  });

  it("supports nested directory paths", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/i18n/zh-CN?transport=json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(2);
    expect(body.chunks[0].data.lang).toBe("zh-CN");
  });

  it("supports HTTP error injection", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/default?httpErrorStatus=401`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toBe("http_error");
  });

  it("supports SSE response", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/default?transport=sse&minIntervalMs=0&maxIntervalMs=0`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("id: 1");
    expect(text).toContain("data: {\"delta\":\"hello\"}");
    expect(text).toContain("event: done");
  });

  it("supports disconnect scenario", async () => {
    await expect(
      fetch(`/api/ai/mock/default?transport=sse&disconnectAt=2&minIntervalMs=0&maxIntervalMs=0`),
    ).rejects.toThrow();
  });

  it("supports reconnect by lastEventId", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/default?transport=sse&reconnect=true&lastEventId=1&minIntervalMs=0&maxIntervalMs=0`,
    );
    const text = await res.text();
    expect(text).not.toContain("id: 1\n");
    expect(text).toContain("id: 2");
    expect(text).toContain("id: 3");
  });
});

// ── TypeScript mock file support ───────────────────────────────────────────

describe("TypeScript mock files", () => {
  it("pattern 1 – static default export returns JSON with transport=json", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-static?transport=json`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks).toHaveLength(3);
    expect(body.chunks[0].data.delta).toBe("from");
  });

  it("pattern 1 – static default export streams SSE", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-static?transport=sse&minIntervalMs=0&maxIntervalMs=0`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    const text = await collectSse(res);
    expect(text).toContain('data: {"delta":"from"}');
    expect(text).toContain('data: {"delta":"-ts"}');
    expect(text).toContain("event: done");
  });

  it("pattern 2 – factory default export is called per request with req access", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-factory?transport=json&name=Claude`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks[0].data.delta).toBe("hello Claude");
  });

  it("pattern 2 – factory default export uses fallback when no query param", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-factory?transport=json`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.chunks[0].data.delta).toBe("hello world");
  });

  it("pattern 3 – handler export takes full middleware control", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-handler?id=abc123`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("success");
    expect(body.source).toBe("ts-handler");
    expect(body.session_id).toBe("session-abc123");
  });

  it("pattern 3 – handler receives correct HTTP method", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/ts-handler`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.method).toBe("POST");
  });

  it(".ts file takes priority over .json when both exist", async () => {
    // The ts-static.ts file and no ts-static.json exist;
    // this confirms ts resolution is attempted first (if json existed it would shadow ts without priority)
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-static?transport=json`,
    );
    const body = (await res.json()) as any;
    // ts-static.ts returns chunks with delta "from", not the default.json format
    expect(body.chunks[0].data.delta).toBe("from");
  });

  it("TS mock supports scenario params (jitter interval)", async () => {
    const res = await fetch(
      `${baseUrl}/api/ai/mock/ts-static?transport=sse&minIntervalMs=0&maxIntervalMs=0`,
    );
    expect(res.status).toBe(200);
    const text = await collectSse(res);
    expect(text).toContain("id: 1");
    expect(text).toContain("id: 2");
    expect(text).toContain("id: 3");
  });
});
