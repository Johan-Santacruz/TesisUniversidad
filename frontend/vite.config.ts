import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

const sendaBackendPort = Number(process.env.SENDA_BACKEND_PORT ?? 8000)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${sendaBackendPort}`,
    },
  },
  test: {
    environment: "jsdom",
    // Por encima del asyncUtilTimeout de src/test/setup.ts (5 s). Si fueran
    // iguales, una espera lenta agotaria el presupuesto del test y este
    // moriria por timeout antes de que la consulta pudiera resolverse.
    testTimeout: 15000,
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ["node_modules/**", "dist/**"],
  },
})
