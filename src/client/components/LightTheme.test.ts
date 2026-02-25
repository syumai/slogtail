import { describe, it, expect } from "vitest";
import {
  panelBodyStyle,
  valueColorStyle,
} from "./LogDetailPanel";

// ---------------------------------------------------------------------------
// Light theme color constants verification
//
// This test file verifies that UI components use light theme colors
// per the design specification (Task 8.1, Requirements 7.1, 7.2, 7.3).
//
// Dark theme colors that must NOT appear:
//   Background: #0f0f23, #1a1a2e, #12122a, #0a0a1a, #16162a
//   Text:       #d0d0e0, #e0e0ff
//   Border:     #2a2a4a, #3a3a5a
//   Selection:  #1e1e3a, #2a4a8a
//
// Expected light theme colors:
//   Background: #ffffff, #f5f5f5, #fafafa
//   Text:       #333333, #666666, #999999
//   Border:     #e0e0e0, #d0d0d0
//   Selection:  #e8f0fe, #1a73e8
// ---------------------------------------------------------------------------

const DARK_BACKGROUND_COLORS = [
  "#0f0f23",
  "#1a1a2e",
  "#12122a",
  "#0a0a1a",
  "#16162a",
];

const DARK_TEXT_COLORS = [
  "#d0d0e0",
  "#e0e0ff",
  "#a0a0c0",
  "#c0c0e0",
  "#c0c0d0",
];

const DARK_BORDER_COLORS = ["#2a2a4a", "#3a3a5a"];

const ALL_DARK_COLORS = [
  ...DARK_BACKGROUND_COLORS,
  ...DARK_TEXT_COLORS,
  ...DARK_BORDER_COLORS,
  "#1e1e3a",
  "#2a4a8a",
  "#6a6a9a",
];

/**
 * Extract hex color values from a CSSProperties object.
 */
function extractColors(style: React.CSSProperties): string[] {
  const colors: string[] = [];
  for (const val of Object.values(style)) {
    if (typeof val === "string") {
      const matches = val.match(/#[0-9a-fA-F]{6}/gi);
      if (matches) {
        colors.push(...matches.map((c) => c.toLowerCase()));
      }
    }
  }
  return colors;
}

// ---------------------------------------------------------------------------
// LogDetailPanel - exported panelBodyStyle
// ---------------------------------------------------------------------------

describe("LogDetailPanel light theme", () => {
  it("panelBodyStyle does not contain any dark theme colors", () => {
    const colors = extractColors(panelBodyStyle);
    for (const darkColor of ALL_DARK_COLORS) {
      expect(colors).not.toContain(darkColor);
    }
  });
});

// ---------------------------------------------------------------------------
// valueColorStyle - type-based colors should remain appropriate for light bg
// ---------------------------------------------------------------------------

describe("valueColorStyle light theme compatibility", () => {
  it("number color is a blue suitable for light background", () => {
    const style = valueColorStyle(42);
    expect(style.color).toBeDefined();
    // Should be #1a73e8 (Google blue) which has good contrast on white
    expect(style.color).toBe("#1a73e8");
  });

  it("boolean color provides good contrast on light background", () => {
    const style = valueColorStyle(true);
    expect(style.color).toBeDefined();
    // Orange-ish color for booleans
    expect(style.color).toBe("#e67e22");
  });

  it("null color provides visible contrast on light background", () => {
    const style = valueColorStyle(null);
    expect(style.color).toBeDefined();
    expect(style.color).toBe("#999999");
  });

  it("string values use default (no color override)", () => {
    const style = valueColorStyle("hello");
    expect(style.color).toBeUndefined();
  });
});
