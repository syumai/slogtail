import module from "node:module"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import devServer from "@hono/vite-dev-server"
import { WebSocketServer } from "ws"

function devWebSocketPlugin(): Plugin {
  return {
    name: "slogtail-dev-ws",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true })

      server.httpServer?.on("upgrade", (req, socket, head) => {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname
        if (pathname !== "/api/ws/tail") return

        const wsHandler = globalThis.__slogtail_dev?.wsHandler
        if (!wsHandler) {
          socket.destroy()
          return
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          wsHandler.handleConnection(ws)
          ws.on("message", (data) => wsHandler.handleMessage(ws, data.toString()))
          ws.on("close", () => wsHandler.handleClose(ws))
        })
      })
    },
  }
}

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [
    !isSsrBuild ? react() : null,
    command === "serve" ? devServer({ entry: "src/server/dev-server.tsx" }) : null,
    command === "serve" ? devWebSocketPlugin() : null,
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
          output: {
            banner: "#!/usr/bin/env node",
          },
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
