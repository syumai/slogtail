import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import devServer from "@hono/vite-dev-server"

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [
    !isSsrBuild ? react() : null,
    command === "serve" ? devServer({ entry: "src/server/index.ts" }) : null,
  ].filter(Boolean),
  build: isSsrBuild
    ? { outDir: "dist", emptyOutDir: false }
    : {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
          input: "src/client/main.tsx",
          output: {
            entryFileNames: "static/client.js",
            chunkFileNames: "static/chunks/[name]-[hash].js",
            assetFileNames: "static/assets/[name]-[hash][extname]",
          },
        },
      },
}))
