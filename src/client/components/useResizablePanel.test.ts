import { describe, it, expect } from "vitest";
import { clampWidth } from "./useResizablePanel";

// ---------------------------------------------------------------------------
// clampWidth - pure function for clamping panel width within bounds
// ---------------------------------------------------------------------------

describe("clampWidth", () => {
  it("returns the value when within bounds", () => {
    expect(clampWidth(500, 200, 800)).toBe(500);
  });

  it("clamps to minWidth when value is below minimum", () => {
    expect(clampWidth(100, 200, 800)).toBe(200);
  });

  it("clamps to maxWidth when value exceeds maximum", () => {
    expect(clampWidth(900, 200, 800)).toBe(800);
  });

  it("returns minWidth when value equals minWidth", () => {
    expect(clampWidth(200, 200, 800)).toBe(200);
  });

  it("returns maxWidth when value equals maxWidth", () => {
    expect(clampWidth(800, 200, 800)).toBe(800);
  });

  it("handles negative values by clamping to minWidth", () => {
    expect(clampWidth(-50, 200, 800)).toBe(200);
  });

  it("handles zero value by clamping to minWidth", () => {
    expect(clampWidth(0, 200, 800)).toBe(200);
  });

  it("works with equal min and max", () => {
    expect(clampWidth(300, 400, 400)).toBe(400);
    expect(clampWidth(500, 400, 400)).toBe(400);
  });
});
