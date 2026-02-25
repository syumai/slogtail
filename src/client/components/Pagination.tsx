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
  backgroundColor: "#f5f5f5",
  borderTop: "1px solid #e0e0e0",
  fontSize: "13px",
};

const buttonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  backgroundColor: disabled ? "#f5f5f5" : "#ffffff",
  border: "1px solid #d0d0d0",
  borderRadius: "4px",
  color: disabled ? "#bbb" : "#333333",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "13px",
});

const infoStyle: React.CSSProperties = {
  color: "#666666",
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
