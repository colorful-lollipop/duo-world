import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * 把 index.html 里的 __PUBLIC_URL__ 换成真实域名（OG / canonical 需要绝对地址）。
 * 构建时用 PUBLIC_URL 环境变量，默认是线上地址。
 */
function publicUrlPlugin(): Plugin {
  const base = (process.env.PUBLIC_URL || "https://love.zulogic.cn").replace(/\/+$/, "");
  return {
    name: "duo-public-url",
    transformIndexHtml(html) {
      return html.split("__PUBLIC_URL__").join(base);
    },
  };
}

export default defineConfig({
  plugins: [react(), publicUrlPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://localhost:8790",
      "/ws": { target: "ws://localhost:8790", ws: true },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
  },
});
