import type { Connect } from "vite";

// Pattern 2: factory function — called per request, result can be dynamic
export default (req: Connect.IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const name = url.searchParams.get("name") ?? "world";
  return {
    chunks: [
      { id: "1", event: "message", data: { delta: `hello ${name}` } },
      { id: "2", event: "message", data: { delta: " (from factory)" } },
    ],
  };
};
