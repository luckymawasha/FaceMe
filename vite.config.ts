import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/facemex/",

  plugins: [react()],

  optimizeDeps: {
    entries: ["src/main.tsx", "src/tempobook/**/*"],
  },

  resolve: {
    alias: {
      "@": "/src",
    },
  },

  server: {
    port: 5173,
    // @ts-ignore
    allowedHosts: true,
  },
});
