import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  AssistantRuntimeProvider,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useAISDKRuntime,
} from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";

// Icons
const ArrowUpIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
);

const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-6 w-6 text-gray-400"
  >
    <path
      fillRule="evenodd"
      d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
      clipRule="evenodd"
    />
  </svg>
);

const AssistantIcon = () => (
  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
    </svg>
  </div>
);

const MyMessage = () => {
  return (
    <MessagePrimitive.Root className="group w-full text-gray-800 dark:text-gray-100 border-b border-black/10 dark:border-gray-900/50 last:border-0">
      <div className="mx-auto flex max-w-3xl gap-4 p-4 text-base md:gap-6 md:py-6">
        <div className="flex flex-shrink-0 flex-col relative items-end">
          <MessagePrimitive.If user>
            <UserIcon />
          </MessagePrimitive.If>
          <MessagePrimitive.If assistant>
            <AssistantIcon />
          </MessagePrimitive.If>
        </div>

        <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 md:gap-3 lg:w-[calc(100%-115px)]">
          <div className="flex flex-grow flex-col gap-3">
            <div className="min-h-[20px] flex flex-col items-start gap-4 whitespace-pre-wrap break-words">
              <MessagePrimitive.Content />
            </div>
          </div>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const EmptyState = () => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center space-y-6 px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black font-semibold text-xl">
        C
      </div>
      <h1 className="text-2xl font-medium text-white text-center">
        How can I help you today?
      </h1>
    </div>
  );
};

function App() {
  const chat = useChat({
    api: "/api/mock/ai/chat", // Fallback if transport fails or if useChat handles it
    // Using transport as per previous code
    transport: new AssistantChatTransport({
      api: "/api/mock/ai/chat",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
    }),
  } as unknown as Parameters<typeof useChat>[0]);

  const runtime = useAISDKRuntime(chat);

  return (
    <div className="flex h-full w-full flex-col bg-[#212121] text-gray-100 font-sans">
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="flex h-full flex-col items-center">
          <ThreadPrimitive.Viewport className="flex-1 w-full overflow-y-auto scroll-smooth">
            <ThreadPrimitive.Empty>
              <EmptyState />
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages
              components={{
                Message: MyMessage,
              }}
            />
          </ThreadPrimitive.Viewport>

          <div className="w-full max-w-3xl px-4 pb-4 pt-2">
            <ComposerPrimitive.Root className="relative flex w-full flex-col rounded-[26px] bg-[#2f2f2f] border-none focus-within:ring-1 focus-within:ring-gray-500 transition-shadow">
              <ComposerPrimitive.Input
                placeholder="Message ChatGPT"
                autoFocus
                className="max-h-[200px] min-h-[52px] w-full resize-none bg-transparent px-4 py-[14px] pr-12 text-white placeholder-gray-400 focus:outline-none scrollbar-hide"
                rows={1}
              />
              <ComposerPrimitive.Send className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black disabled:bg-[#676767] disabled:text-[#2f2f2f] transition-colors">
                <ArrowUpIcon />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>

            <div className="mt-2 text-center text-xs text-[#b4b4b4]">
              ChatGPT can make mistakes. Check important info.
            </div>
          </div>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </div>
  );
}

export default App;
