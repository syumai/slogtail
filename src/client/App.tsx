import { useRef } from "react";
import { FilterProvider } from "./store";
import { SearchBar } from "./components/SearchBar";
import { StatsBar } from "./components/StatsBar";
import { LogViewer } from "./components/LogViewer";
import { FacetSidebar } from "./components/FacetSidebar";
import { ExportButton } from "./components/ExportButton";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const appStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  backgroundColor: "#0f0f23",
  color: "#d0d0e0",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  backgroundColor: "#0a0a1a",
  borderBottom: "1px solid #2a2a4a",
};

const titleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
  color: "#e0e0ff",
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  overflow: "hidden",
};

const mainContentStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
};

// ---------------------------------------------------------------------------
// AppContent - uses filter context
// ---------------------------------------------------------------------------

function AppContent() {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div style={appStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>lduck</h1>
        <ExportButton />
      </header>
      <SearchBar searchInputRef={searchInputRef} />
      <StatsBar />
      <div style={bodyStyle}>
        <FacetSidebar />
        <div style={mainContentStyle}>
          <LogViewer searchInputRef={searchInputRef} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App - wraps with providers
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <FilterProvider>
      <AppContent />
    </FilterProvider>
  );
}
