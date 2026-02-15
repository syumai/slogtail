import { useEffect, useState } from "react"
import { hc } from "hono/client"
import type { AppType } from "../server/app"

const client = hc<AppType>("/")

export default function App() {
  const [status, setStatus] = useState("")

  useEffect(() => {
    client.api.health
      .$get()
      .then((res) => res.json())
      .then((data) => setStatus(`Server ${data.status}, uptime: ${data.uptime}s`))
  }, [])

  return (
    <div>
      <h1>lduck</h1>
      <p>{status || "Loading..."}</p>
    </div>
  )
}
