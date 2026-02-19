import { useCallback } from "react";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "12px 16px",
  backgroundColor: "#1a1a2e",
  borderTop: "1px solid #2a2a4a",
  fontSize: "13px",
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  backgroundColor: disabled ? "#1a1a2e" : "#2a2a4a",
  border: "1px solid #3a3a5a",
  borderRadius: "4px",
  color: disabled ? "#555" : "#c0c0e0",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "13px",
});

const infoStyle: React.CSSProperties = {
  color: "#a0a0c0",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PaginationProps {
  offset: number;
  limit: number;
  total: number;
  onOffsetChange(offset: number): void;
}

export function Pagination({ offset, limit, total, onOffsetChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const handlePrev = useCallback(() => {
    if (canPrev) {
      onOffsetChange(Math.max(0, offset - limit));
    }
  }, [canPrev, offset, limit, onOffsetChange]);

  const handleNext = useCallback(() => {
    if (canNext) {
      onOffsetChange(offset + limit);
    }
  }, [canNext, offset, limit, onOffsetChange]);

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  return (
    <div style={containerStyle}>
      <button style={buttonStyle(!canPrev)} disabled={!canPrev} onClick={handlePrev}>
        Prev
      </button>
      <span style={infoStyle}>
        {rangeStart}-{rangeEnd} of {total.toLocaleString()} (Page {currentPage}/{totalPages})
      </span>
      <button style={buttonStyle(!canNext)} disabled={!canNext} onClick={handleNext}>
        Next
      </button>
    </div>
  );
}
