import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Windows 下 target 里的 exe 被 cargo 锁定，watch 会抛 EBUSY 崩溃；前端也不需要监听 Rust 侧。
      ignored: ["**/src-tauri/**", "**/node_modules/**", "**/dist/**", "**/target/**"],
    },
  },
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
