import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { aiMockPlugin, type EndpointPattern } from "../src/index";

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

  it("matches path via RegExp and returns JSON", async () => {
    const res = await fetch(`${url}/api/ai/anything?file=default`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mode).toBe("json");
    expect(body.total).toBe(3);
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
    const res = await fetch(`${url}/api/chat/default`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mode).toBe("json");
    expect(body.total).toBe(3);
  });

  it("matches second RegExp item via ?file=", async () => {
    const res = await fetch(`${url}/v2/ai/stream?file=default`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mode).toBe("json");
    expect(body.total).toBe(3);
  });

  it("does not match an unrelated path", async () => {
    const res = await fetch(`${url}/api/ai/mock`);
    expect(res.status).not.toBe(200);
  });
});

describe("aiMockPlugin", () => {
  it("returns JSON mode by default", async () => {
    const res = await fetch(`${baseUrl}/api/ai/mock/default`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mode).toBe("json");
    expect(body.total).toBe(3);
    expect(body.chunks[0].data.delta).toBe("hello");
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
