import { useEffect, useState } from "react";
import { client } from "./api";
import { FilterProvider, useFilters } from "./store";

function AppContent() {
  const [status, setStatus] = useState("");
  const [filters] = useFilters();

  useEffect(() => {
    client.api.health
      .$get()
      .then((res) => res.json())
      .then((data) => setStatus(`Server ${data.status}, uptime: ${data.uptime}s`))
      .catch(() => setStatus("Failed to connect"));
  }, []);

  return (
    <div>
      <h1>lduck</h1>
      <p>{status || "Loading..."}</p>
      <p>
        Order: {filters.order} | Limit: {filters.limit} | Live tail:{" "}
        {filters.isLiveTail ? "ON" : "OFF"}
      </p>
    </div>
  );
}

export default function App() {
  return (
    <FilterProvider>
      <AppContent />
    </FilterProvider>
  );
}
