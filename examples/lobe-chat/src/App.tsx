import { ChatList, type ChatMessage } from "@lobehub/ui/chat";
import { ThemeProvider, Markdown } from "@lobehub/ui";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState, useMemo } from "react";

const INITIAL_TIMESTAMP = Date.now();

// Custom message renderer
const MessageRenderer = ({ content }: ChatMessage) => {
  return <Markdown>{content}</Markdown>;
};

function App() {
  const [inputValue, setInputValue] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/mock/ai/chat",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const getMessageContent = (m: UIMessage): string => {
    if (!m.parts) return "";
    return m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  const chatMessages: ChatMessage[] = useMemo(() => {
    return messages.map((m) => {
      const content = getMessageContent(m);
      return {
        id: m.id,
        content,
        role: m.role,
        createAt: INITIAL_TIMESTAMP,
        updateAt: INITIAL_TIMESTAMP,
        meta: {
          avatar: m.role === "user" ? "👤" : "🤖",
          title: m.role === "user" ? "User" : "Assistant",
        },
      };
    });
  }, [messages]);

  return (
    <ThemeProvider appearance="dark">
      <div className="flex flex-col h-screen bg-[#212121] text-gray-100 font-sans">
        <div className="flex-1 overflow-y-auto w-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4">
                <span className="text-black text-xl font-semibold">C</span>
              </div>
              <h2 className="text-2xl font-semibold">
                How can I help you today?
              </h2>
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto p-4">
              <ChatList
              data={chatMessages}
              renderMessages={{
                user: MessageRenderer,
                assistant: MessageRenderer,
              }}
            />
            </div>
          )}
        </div>

        <div className="w-full p-4">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inputValue.trim() || isLoading) return;
                sendMessage({ text: inputValue });
                setInputValue("");
              }}
              className="relative"
            >
              <input
                name="prompt"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Message ChatGPT"
                className="w-full bg-[#2f2f2f] text-white placeholder-gray-400 rounded-3xl py-3.5 pl-4 pr-12 focus:outline-none focus:ring-0 border border-transparent focus:border-gray-600 transition-colors resize-none overflow-hidden"
                style={{ minHeight: "52px" }}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className={`absolute right-2 bottom-2 p-1.5 rounded-full transition-colors ${
                  inputValue.trim()
                    ? "bg-white text-black"
                    : "bg-[#676767] text-[#2f2f2f]"
                }`}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                >
                  <path
                    d="M12 4V20M12 4L6 10M12 4L18 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </form>
            <div className="text-center mt-2">
              <p className="text-xs text-[#b4b4b4]">
                ChatGPT can make mistakes. Check important info.
              </p>
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
