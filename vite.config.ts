import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mobile-first 3D Battleship — Vite + React + React Three Fiber.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: { target: "es2020", chunkSizeWarningLimit: 1500 },
});
