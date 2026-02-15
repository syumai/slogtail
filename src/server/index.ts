import { Hono } from "hono"
import api from "./app"

export function createApp(scriptSrc: string, setup?: (app: Hono) => void) {
  const app = new Hono()
  app.route("/", api)
  setup?.(app)
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
  <script type="module" src="${scriptSrc}"></script>
</body>
</html>`),
  )
  return app
}

export default createApp("/src/client/main.tsx")
