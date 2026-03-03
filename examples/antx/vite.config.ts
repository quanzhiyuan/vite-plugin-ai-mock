import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aiMockPlugin } from "vite-plugin-ai-mock";

export default defineConfig({
  plugins: [
    react(),
    aiMockPlugin({ dataDir: "mock/ai", endpoint: "/api/mock/ai" }),
  ],
});
