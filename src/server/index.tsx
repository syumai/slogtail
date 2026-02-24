import { Hono } from "hono"
import { renderToString } from "react-dom/server"
import { ReactRefresh, ViteClient } from "vite-ssr-components/react"
import api from "./app"

export function createApp(scriptSrc: string, setup?: (app: Hono) => void) {
  const app = new Hono()
  app.route("/", api)
  setup?.(app)
  app.get("*", (c) => {
    const html = renderToString(
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1.0" />
          <title>lduck</title>
          <ViteClient />
          <ReactRefresh />
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src={scriptSrc} />
        </body>
      </html>,
    )
    return c.html(`<!DOCTYPE html>${html}`)
  })
  return app
}

export default createApp("/src/client/main.tsx")
