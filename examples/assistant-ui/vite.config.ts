import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aiMockPlugin } from "../../src/index";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    aiMockPlugin({ dataDir: "mock/ai", endpoint: "/api/mock/ai" }),
  ],
});
