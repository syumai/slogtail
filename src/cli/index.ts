import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { createApp } from "../server/index"

const app = createApp("/static/client.js", (app) => {
  app.use("/static/*", serveStatic({ root: import.meta.dirname }))
})

const port = parseInt(process.env.PORT ?? "3000", 10)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`lduck server listening on http://localhost:${info.port}`)
})
