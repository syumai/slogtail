import { useEffect, useState } from "react"
import { hc } from "hono/client"
import type { AppType } from "../server/app"

const client = hc<AppType>("/")

export default function App() {
  const [message, setMessage] = useState("")

  useEffect(() => {
    client.api.hello
      .$get({ query: { name: "lduck" } })
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
  }, [])

  return (
    <div>
      <h1>lduck</h1>
      <p>{message || "Loading..."}</p>
    </div>
  )
}
