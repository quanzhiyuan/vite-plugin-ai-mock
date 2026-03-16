// Pattern 1: static default export (same as JSON)
export default {
  chunks: [
    { id: "1", event: "message", data: { delta: "from" } },
    { id: "2", event: "message", data: { delta: "-ts" } },
    { id: "3", event: "message", data: { delta: "!" } },
  ],
};
