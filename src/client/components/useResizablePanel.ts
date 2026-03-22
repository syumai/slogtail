import { useState, useCallback, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// clampWidth - pure function for clamping panel width within bounds
// ---------------------------------------------------------------------------

export function clampWidth(
  value: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (value < minWidth) return minWidth;
  if (value > maxWidth) return maxWidth;
  return value;
}

// ---------------------------------------------------------------------------
// useResizablePanel hook
// ---------------------------------------------------------------------------

export interface UseResizablePanelOptions {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey?: string;
}

export interface UseResizablePanelResult {
  width: number;
  isResizing: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

export function useResizablePanel(
  options: UseResizablePanelOptions,
): UseResizablePanelResult {
  const { initialWidth, minWidth, maxWidth, storageKey } = options;
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) return clampWidth(parsed, minWidth, maxWidth);
      }
    }
    return initialWidth;
  });
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(initialWidth);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setIsResizing(true);
    },
    [width],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Panel is on the right side, so dragging left (negative deltaX) increases width
      const deltaX = startXRef.current - e.clientX;
      const newWidth = clampWidth(
        startWidthRef.current + deltaX,
        minWidth,
        maxWidth,
      );
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  const prevIsResizingRef = useRef(false);
  useEffect(() => {
    if (prevIsResizingRef.current && !isResizing && storageKey) {
      localStorage.setItem(storageKey, String(width));
    }
    prevIsResizingRef.current = isResizing;
  }, [isResizing, storageKey, width]);

  return { width, isResizing, handleMouseDown };
}
