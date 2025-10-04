import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://api.fullbor.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/v2"),
      },
    },
  },
});
