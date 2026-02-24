import module from "node:module"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import devServer from "@hono/vite-dev-server"

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [
    !isSsrBuild ? react() : null,
    command === "serve" ? devServer({ entry: "src/server/dev-server.tsx" }) : null,
  ].filter(Boolean),
  ssr: {
    target: "node",
    external: ["@duckdb/node-api"],
    noExternal: ["vite-ssr-components"],
  },
  build: isSsrBuild
    ? {
        outDir: "dist",
        emptyOutDir: false,
        rollupOptions: {
          external: [
            /^@duckdb/,
            ...module.builtinModules,
            ...module.builtinModules.map((m) => `node:${m}`),
          ],
        },
      }
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
