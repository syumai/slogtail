import { describe, it, expect } from "vitest"
import app from "./app"

describe("GET /api/hello", () => {
  it("returns greeting with name", async () => {
    const res = await app.request("/api/hello?name=test")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "Hello, test!" })
  })

  it("returns default greeting without name", async () => {
    const res = await app.request("/api/hello")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: "Hello, World!" })
  })
})
