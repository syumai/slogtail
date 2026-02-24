import { devResources } from "./dev-init"
import { createApiApp } from "./app"
import { createApp } from "./index"

const api = createApiApp(devResources.db, devResources.ingester)

export default createApp("/src/client/main.tsx", (app) => {
  app.route("/", api)
})
