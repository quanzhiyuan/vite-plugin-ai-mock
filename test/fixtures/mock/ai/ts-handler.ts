import type { MockRequestHandler } from "../../../../src/index";

// Pattern 3: raw middleware handler — full control over req/res
export const handler: MockRequestHandler = (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const id = url.searchParams.get("id") ?? "new";

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      status: "success",
      source: "ts-handler",
      session_id: `session-${id}`,
      method: req.method,
    }),
  );
};
