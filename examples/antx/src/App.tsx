import { Bubble, Sender } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import { XRequest } from "@ant-design/x-sdk";
import { useMemo, useState, useRef } from "react";

type Role = "user" | "assistant";

type Message = {
  key: string;
  role: Role;
  content: string;
};

// Custom output type for vite-plugin-ai-mock SSE chunks
interface MockSSEChunk {
  data?: string;
  event?: string;
  id?: string;
  retry?: string;
}

// Parsed data from the SSE data field
interface MockTextDelta {
  type: string;
  delta?: string;
}

const genId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<ReturnType<
    typeof XRequest<
      { messages: { role: string; content: string }[] },
      MockSSEChunk
    >
  > | null>(null);

  const items = useMemo(
    () =>
      messages.map((msg) => ({
        key: msg.key,
        role: msg.role,
        content: msg.content,
        placement: msg.role === "user" ? "end" : "start",
      })),
    [messages],
  );

  const handleSubmit = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const userKey = genId();
    const assistantKey = genId();

    setMessages((prev) => [
      ...prev,
      { key: userKey, role: "user", content },
      { key: assistantKey, role: "assistant", content: "" },
    ]);

    setLoading(true);

    // Create XRequest instance with typed generics
    requestRef.current = XRequest<
      { messages: { role: string; content: string }[] },
      MockSSEChunk
    >("/api/mock/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      params: {
        messages: [...messages, { role: "user", content }],
      },
      callbacks: {
        onUpdate: (chunk: MockSSEChunk) => {
          // Parse the SSE data field which contains JSON from vite-plugin-ai-mock
          if (chunk.data) {
            try {
              const parsed: MockTextDelta = JSON.parse(chunk.data);
              if (parsed.type === "text-delta" && parsed.delta) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.key === assistantKey
                      ? { ...msg, content: msg.content + parsed.delta }
                      : msg,
                  ),
                );
              }
            } catch {
              // Ignore non-JSON data
            }
          }
        },
        onSuccess: () => {
          setLoading(false);
        },
        onError: (error: Error) => {
          const message = error.message || "Unknown error";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.key === assistantKey
                ? {
                    ...msg,
                    content:
                      msg.content ||
                      `Mock request failed. Please retry. (${message})`,
                  }
                : msg,
            ),
          );
          setLoading(false);
        },
      },
    });
  };

  return (
    <div className="page">
      <div className="chat-shell">
        <header className="chat-header">
          <div className="dot" />
          <span>Ant Design X Demo</span>
        </header>

        <main className="chat-main">
          {items.length === 0 ? (
            <div className="empty">How can I help you today?</div>
          ) : (
            <Bubble.List
              items={items as any}
              roles={{
                assistant: {
                  placement: "start",
                  messageRender: (content: string) => (
                    <XMarkdown>{content}</XMarkdown>
                  ),
                },
                user: {
                  placement: "end",
                },
              }}
            />
          )}
        </main>

        <footer className="chat-footer">
          <Sender
            className="sender"
            placeholder="Message ChatGPT"
            onSubmit={handleSubmit as any}
            loading={loading as any}
          />
          <div className="disclaimer">
            ChatGPT can make mistakes. Check important info.
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
