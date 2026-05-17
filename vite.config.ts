import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle these so the dev server doesn't hit "optimized dependencies
  // changed. reloading" the first time a page imports them — that hot-reload
  // mid-session leaves a stale React reference in the optimized zustand
  // bundle and the next render throws "Invalid hook call". Listing them
  // upfront makes Vite include them in the initial scan.
  optimizeDeps: {
    include: ["zustand", "zustand/middleware"],
  },
  server: {
    host: "0.0.0.0", // expose on LAN so iPhone can test
    port: 5173,
    // Forward /api/** to the deployed Firebase Hosting URL. Hosting's
    // rewrite then dispatches to the Cloud Function in asia-south1.
    // Proxying server-side avoids the CORS headache we'd hit if we just
    // pointed `VITE_API_BASE` at the function URL directly.
    proxy: {
      "/api": {
        target: "https://recipy-63422.web.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
