import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import api from "../server/app"

const app = new Hono()
app.route("/", api)
app.use("/static/*", serveStatic({ root: import.meta.dirname }))
app.get("*", (c) =>
  c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>lduck</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/static/client.js"></script>
</body>
</html>`),
)

const port = parseInt(process.env.PORT ?? "3000", 10)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`lduck server listening on http://localhost:${info.port}`)
})
