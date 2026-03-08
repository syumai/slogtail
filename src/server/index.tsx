import { Hono } from "hono"
import { renderToString } from "react-dom/server"
import { ReactRefresh, ViteClient } from "vite-ssr-components/react"

export function createApp(scriptSrc: string, setup?: (app: Hono) => void) {
  const app = new Hono()
  setup?.(app)
  app.get("*", (c) => {
    const html = renderToString(
      <html lang="en" style={{ margin: 0, padding: 0, height: "100%" }}>
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1.0" />
          <title>slogtail</title>
          <ViteClient />
          <ReactRefresh />
        </head>
        <body style={{ margin: 0, padding: 0, height: "100%" }}>
          <div id="root"></div>
          <script type="module" src={scriptSrc} />
        </body>
      </html>,
    )
    return c.html(`<!DOCTYPE html>${html}`)
  })
  return app
}
