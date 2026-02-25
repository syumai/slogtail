import { describe, expect, it } from "vitest";
import { bucketIndexFromX } from "./HistogramChart";

describe("bucketIndexFromX", () => {
  it("returns 0 when bucket count is invalid", () => {
    expect(bucketIndexFromX(10, 1000, 0)).toBe(0);
    expect(bucketIndexFromX(10, 0, 10)).toBe(0);
  });

  it("maps x positions to the expected bucket index", () => {
    expect(bucketIndexFromX(0, 1000, 10)).toBe(0);
    expect(bucketIndexFromX(99, 1000, 10)).toBe(0);
    expect(bucketIndexFromX(100, 1000, 10)).toBe(1);
    expect(bucketIndexFromX(550, 1000, 10)).toBe(5);
  });

  it("clamps overflow to the last bucket", () => {
    expect(bucketIndexFromX(9999, 1000, 10)).toBe(9);
    expect(bucketIndexFromX(-20, 1000, 10)).toBe(0);
  });
});
