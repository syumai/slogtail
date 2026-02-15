import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

const app = new Hono()
  .basePath("/api")
  .get(
    "/hello",
    zValidator(
      "query",
      z.object({
        name: z.string().optional(),
      }),
    ),
    (c) => {
      const { name } = c.req.valid("query")
      return c.json({ message: `Hello, ${name ?? "World"}!` })
    },
  )

export type AppType = typeof app
export default app
