import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  base: '/facemex/',
  optimizeDeps: {
    entries: ["src/main.tsx", "src/tempobook/**/*"],
  },
   plugins: [react()],
   resolve: {
    alias: {
      "@": "/src",
    },
  },

  server: {
    port: 5173,
  },
});
  server: {
    // @ts-ignore
    allowedHosts: true,
  }
});
