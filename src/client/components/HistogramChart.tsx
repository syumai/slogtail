import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistogramBucket } from "../../types";
import { LOG_LEVELS } from "../../types";
import { formatLocalDateTimeTruncated } from "../formatTime";
import { LEVEL_COLORS } from "./LogRow";

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
};

const tooltipStyle: React.CSSProperties = {
  position: "absolute",
  pointerEvents: "none",
  backgroundColor: "#111827",
  color: "#ffffff",
  borderRadius: "4px",
  padding: "6px 8px",
  fontSize: "11px",
  lineHeight: 1.4,
  whiteSpace: "nowrap",
  zIndex: 5,
  transform: "translate(-50%, -100%)",
  marginTop: "8px",
};

export interface TimeRangeSelection {
  start: Date;
  end: Date;
}

interface HistogramChartProps {
  buckets: HistogramBucket[];
  height?: number;
  selectedRange?: TimeRangeSelection | null;
  onTimeRangeSelect?(start: Date, end: Date): void;
}

interface HoverState {
  index: number;
  x: number;
  y: number;
}

interface DragState {
  startX: number;
  currentX: number;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function bucketIndexFromX(x: number, width: number, bucketCount: number): number {
  if (bucketCount <= 0 || width <= 0) return 0;
  const barWidth = width / bucketCount;
  const clampedX = clamp(x, 0, width - 1);
  return Math.floor(clampedX / barWidth);
}

export function tooltipPositionFromClientPoint(
  clientX: number,
  clientY: number,
  rect: RectLike,
): { x: number; y: number } {
  const x = clamp(clientX - rect.left, 8, Math.max(8, rect.width - 8));
  const y = clamp(clientY - rect.top, 8, Math.max(8, rect.height - 8));
  return { x, y };
}

function formatBucketTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return formatLocalDateTimeTruncated(date);
}

function rangeFromIndexes(
  buckets: HistogramBucket[],
  firstIndex: number,
  secondIndex: number,
): TimeRangeSelection | null {
  if (buckets.length === 0) return null;
  const minIndex = clamp(Math.min(firstIndex, secondIndex), 0, buckets.length - 1);
  const maxIndex = clamp(Math.max(firstIndex, secondIndex), 0, buckets.length - 1);
  const start = new Date(buckets[minIndex]?.timestamp ?? "");
  const end = new Date(buckets[maxIndex]?.timestamp ?? "");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

function isBucketInRange(timestamp: string, range: TimeRangeSelection | null | undefined): boolean {
  if (!range) return false;
  const ts = new Date(timestamp).getTime();
  if (Number.isNaN(ts)) return false;
  const start = Math.min(range.start.getTime(), range.end.getTime());
  const end = Math.max(range.start.getTime(), range.end.getTime());
  return ts >= start && ts <= end;
}

export function HistogramChart({
  buckets,
  height = 120,
  selectedRange,
  onTimeRangeSelect,
}: HistogramChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const svgWidth = 1000;
  const barWidth = buckets.length > 0 ? svgWidth / buckets.length : svgWidth;
  const totals = useMemo(
    () =>
      buckets.map((bucket) =>
        LOG_LEVELS.reduce((sum, level) => sum + (bucket.counts[level] ?? 0), 0),
      ),
    [buckets],
  );
  const maxTotal = Math.max(1, ...totals);

  const activeDragRange = useMemo(() => {
    if (!drag) return null;
    const startIndex = bucketIndexFromX(drag.startX, svgWidth, buckets.length);
    const endIndex = bucketIndexFromX(drag.currentX, svgWidth, buckets.length);
    return rangeFromIndexes(buckets, startIndex, endIndex);
  }, [buckets, drag]);

  const highlightedRange = activeDragRange ?? selectedRange ?? null;

  const resolveLocalX = useCallback((clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    if (rect.width <= 0) return 0;
    const ratio = svgWidth / rect.width;
    return (clientX - rect.left) * ratio;
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (buckets.length === 0) return;
      const x = resolveLocalX(event.clientX);
      setDrag({ startX: x, currentX: x });
    },
    [buckets.length, resolveLocalX],
  );

  useEffect(() => {
    if (!drag) return;
    const handleMove = (event: MouseEvent) => {
      setDrag((prev) => (prev ? { ...prev, currentX: resolveLocalX(event.clientX) } : null));
    };
    const handleUp = (event: MouseEvent) => {
      const x = resolveLocalX(event.clientX);
      const startIndex = bucketIndexFromX(drag.startX, svgWidth, buckets.length);
      const endIndex = bucketIndexFromX(x, svgWidth, buckets.length);
      const range = rangeFromIndexes(buckets, startIndex, endIndex);
      if (range && onTimeRangeSelect) {
        onTimeRangeSelect(range.start, range.end);
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [buckets, drag, onTimeRangeSelect, resolveLocalX]);

  return (
    <div style={containerStyle}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: `${height}px`, display: "block", cursor: "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseLeave={() => setHover(null)}
      >
        <rect x={0} y={0} width={svgWidth} height={height} fill="#f3f4f6" />

        {buckets.map((bucket, index) => {
          const x = index * barWidth;
          let yCursor = height;

          return (
            <g key={bucket.timestamp}>
              {isBucketInRange(bucket.timestamp, highlightedRange) && (
                <rect x={x} y={0} width={Math.max(1, barWidth - 1)} height={height} fill="#2563eb20" />
              )}
              {LOG_LEVELS.map((level) => {
                const count = bucket.counts[level] ?? 0;
                if (count <= 0) return null;
                const rawHeight = (count / maxTotal) * height;
                const segmentHeight = Math.max(1, rawHeight);
                yCursor = Math.max(0, yCursor - segmentHeight);
                return (
                  <rect
                    key={`${bucket.timestamp}-${level}`}
                    x={x}
                    y={yCursor}
                    width={Math.max(1, barWidth - 1)}
                    height={segmentHeight}
                    fill={LEVEL_COLORS[level]}
                  />
                );
              })}
              <rect
                x={x}
                y={0}
                width={Math.max(1, barWidth - 1)}
                height={height}
                fill="transparent"
                onMouseMove={(event) => {
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const position = tooltipPositionFromClientPoint(
                    event.clientX,
                    event.clientY,
                    rect,
                  );
                  setHover({
                    index,
                    x: position.x,
                    y: position.y,
                  });
                }}
              />
            </g>
          );
        })}

        {drag && (
          <rect
            x={Math.min(drag.startX, drag.currentX)}
            y={0}
            width={Math.abs(drag.currentX - drag.startX)}
            height={height}
            fill="#2563eb33"
            stroke="#2563eb"
            strokeWidth={1}
          />
        )}
      </svg>

      {hover && buckets[hover.index] && (
        <div style={{ ...tooltipStyle, left: hover.x, top: hover.y }}>
          <div>{formatBucketTimestamp(buckets[hover.index]!.timestamp)}</div>
          {LOG_LEVELS.map((level) => (
            <div key={level}>
              {level}: {buckets[hover.index]!.counts[level] ?? 0}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
