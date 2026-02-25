import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  flattenObject,
  EXCLUDED_KEYS,
  valueColorStyle,
  copyToClipboard,
} from "./LogDetailPanel";

// ---------------------------------------------------------------------------
// EXCLUDED_KEYS
// ---------------------------------------------------------------------------

describe("EXCLUDED_KEYS", () => {
  it("contains _id and _ingested", () => {
    expect(EXCLUDED_KEYS.has("_id")).toBe(true);
    expect(EXCLUDED_KEYS.has("_ingested")).toBe(true);
  });

  it("does not contain regular field names", () => {
    expect(EXCLUDED_KEYS.has("message")).toBe(false);
    expect(EXCLUDED_KEYS.has("level")).toBe(false);
    expect(EXCLUDED_KEYS.has("timestamp")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// flattenObject - basic behavior
// ---------------------------------------------------------------------------

describe("flattenObject", () => {
  it("flattens a simple flat object", () => {
    const result = flattenObject({
      message: "hello",
      level: "INFO",
      service: "api",
    });
    expect(result).toEqual([
      { key: "message", value: "hello" },
      { key: "level", value: "INFO" },
      { key: "service", value: "api" },
    ]);
  });

  it("returns empty array for empty object", () => {
    const result = flattenObject({});
    expect(result).toEqual([]);
  });

  it("handles primitive value types correctly", () => {
    const result = flattenObject({
      str: "text",
      num: 42,
      bool: true,
      nil: null,
    });
    expect(result).toEqual([
      { key: "str", value: "text" },
      { key: "num", value: 42 },
      { key: "bool", value: true },
      { key: "nil", value: null },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Excluded keys
  // ---------------------------------------------------------------------------

  it("excludes _id and _ingested keys", () => {
    const result = flattenObject({
      _id: "abc123",
      _ingested: "2026-01-01T00:00:00Z",
      message: "hello",
    });
    expect(result).toEqual([{ key: "message", value: "hello" }]);
  });

  it("excludes _id and _ingested even when nested at top level", () => {
    const result = flattenObject({
      _id: "abc123",
      _ingested: "2026-01-01T00:00:00Z",
      context: { user: "alice" },
    });
    expect(result).toEqual([{ key: "context.user", value: "alice" }]);
  });

  // ---------------------------------------------------------------------------
  // Nested object flattening with dot notation
  // ---------------------------------------------------------------------------

  it("flattens nested objects with dot notation", () => {
    const result = flattenObject({
      context: {
        user: {
          id: "u1",
          name: "alice",
        },
      },
    });
    expect(result).toEqual([
      { key: "context.user.id", value: "u1" },
      { key: "context.user.name", value: "alice" },
    ]);
  });

  it("handles mixed flat and nested fields", () => {
    const result = flattenObject({
      message: "hello",
      context: {
        requestId: "r1",
      },
      level: "INFO",
    });
    expect(result).toEqual([
      { key: "message", value: "hello" },
      { key: "context.requestId", value: "r1" },
      { key: "level", value: "INFO" },
    ]);
  });

  it("uses prefix parameter for nested calls", () => {
    const result = flattenObject(
      { id: "u1", name: "alice" },
      "user",
    );
    expect(result).toEqual([
      { key: "user.id", value: "u1" },
      { key: "user.name", value: "alice" },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Array values
  // ---------------------------------------------------------------------------

  it("treats arrays as leaf values (not recursed into)", () => {
    const result = flattenObject({
      tags: ["a", "b", "c"],
      message: "hello",
    });
    expect(result).toEqual([
      { key: "tags", value: ["a", "b", "c"] },
      { key: "message", value: "hello" },
    ]);
  });

  // ---------------------------------------------------------------------------
  // Circular reference detection
  // ---------------------------------------------------------------------------

  it("skips circular references", () => {
    const obj: Record<string, unknown> = { name: "root" };
    obj.self = obj; // circular reference
    const result = flattenObject(obj);
    // "self" should be skipped, only "name" should appear
    expect(result).toEqual([{ key: "name", value: "root" }]);
  });

  it("skips deeply nested circular references", () => {
    const inner: Record<string, unknown> = { value: "inner" };
    const obj: Record<string, unknown> = {
      level1: {
        level2: inner,
      },
    };
    inner.back = obj; // circular reference back to root
    const result = flattenObject(obj);
    expect(result).toEqual([
      { key: "level1.level2.value", value: "inner" },
      // level1.level2.back should be skipped
    ]);
  });

  // ---------------------------------------------------------------------------
  // Max depth limit (10 levels)
  // ---------------------------------------------------------------------------

  it("stops at max depth of 10 levels", () => {
    // Build a deeply nested object (12 levels deep)
    let current: Record<string, unknown> = { leaf: "deep" };
    for (let i = 11; i >= 1; i--) {
      current = { [`l${i}`]: current };
    }
    // current is l1 -> l2 -> ... -> l11 -> { leaf: "deep" }
    // That's 12 levels of nesting

    const result = flattenObject(current);

    // Should flatten up to 10 levels, but anything beyond should be returned as-is
    // The key at depth 10 should still be present as a value (the remaining nested object)
    const deepKeys = result.map((r) => r.key);

    // We should NOT have a key with more than 10 dot-separated segments
    for (const key of deepKeys) {
      const depth = key.split(".").length;
      expect(depth).toBeLessThanOrEqual(10);
    }

    // At depth 10, the remaining nested object should be returned as the value
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the nested object as value when max depth is reached", () => {
    // Build exactly 10 levels deep then one more
    let deepObj: Record<string, unknown> = { finalKey: "finalValue" };
    for (let i = 10; i >= 1; i--) {
      deepObj = { [`level${i}`]: deepObj };
    }
    // level1 -> level2 -> ... -> level10 -> { finalKey: "finalValue" }
    // 11 levels of nesting

    const result = flattenObject(deepObj);

    // Find the deepest key
    const maxDepthEntry = result.find((r) =>
      r.key.split(".").length === 10,
    );
    expect(maxDepthEntry).toBeDefined();
    // The value at max depth should be the remaining nested object
    expect(typeof maxDepthEntry!.value).toBe("object");
    expect(maxDepthEntry!.value).toEqual({ finalKey: "finalValue" });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it("handles undefined values in object", () => {
    const result = flattenObject({
      a: undefined,
      b: "value",
    });
    expect(result).toEqual([
      { key: "a", value: undefined },
      { key: "b", value: "value" },
    ]);
  });

  it("handles nested empty objects", () => {
    const result = flattenObject({
      empty: {},
      message: "hello",
    });
    // An empty nested object should produce no entries for that key
    expect(result).toEqual([{ key: "message", value: "hello" }]);
  });
});

// ---------------------------------------------------------------------------
// valueColorStyle - type-based color differentiation
// ---------------------------------------------------------------------------

describe("valueColorStyle", () => {
  it("returns default text color for string values", () => {
    const style = valueColorStyle("hello");
    // String values should use default text color (no special color override,
    // or the same as default text color)
    expect(style.color).toBeUndefined();
  });

  it("returns blue-ish color for number values", () => {
    const style = valueColorStyle(42);
    expect(style.color).toBeDefined();
    expect(typeof style.color).toBe("string");
    // Should be a blue-ish color
    expect(style.color).toMatch(/blue|#[0-9a-fA-F]+/i);
  });

  it("returns blue-ish color for zero", () => {
    const style = valueColorStyle(0);
    expect(style.color).toBeDefined();
  });

  it("returns blue-ish color for negative numbers", () => {
    const style = valueColorStyle(-3.14);
    expect(style.color).toBeDefined();
  });

  it("returns orange-ish color for boolean true", () => {
    const style = valueColorStyle(true);
    expect(style.color).toBeDefined();
    expect(typeof style.color).toBe("string");
  });

  it("returns orange-ish color for boolean false", () => {
    const style = valueColorStyle(false);
    expect(style.color).toBeDefined();
    // Should be same color as boolean true
    expect(style.color).toBe(valueColorStyle(true).color);
  });

  it("returns grey-ish color for null", () => {
    const style = valueColorStyle(null);
    expect(style.color).toBeDefined();
    expect(typeof style.color).toBe("string");
  });

  it("returns default style for undefined", () => {
    const style = valueColorStyle(undefined);
    // undefined is not string/number/boolean/null, treat like string (default)
    expect(style.color).toBeUndefined();
  });

  it("returns default style for object values", () => {
    const style = valueColorStyle({ foo: "bar" });
    expect(style.color).toBeUndefined();
  });

  it("returns default style for array values", () => {
    const style = valueColorStyle([1, 2, 3]);
    expect(style.color).toBeUndefined();
  });

  it("returns a CSSProperties-compatible object", () => {
    // All return values should be valid React.CSSProperties
    for (const val of ["text", 42, true, null, undefined]) {
      const style = valueColorStyle(val);
      expect(typeof style).toBe("object");
      expect(style).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// copyToClipboard - clipboard helper
// ---------------------------------------------------------------------------

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when clipboard write succeeds", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const result = await copyToClipboard("hello");
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("hello");
  });

  it("returns false when clipboard write throws", async () => {
    const writeTextMock = vi
      .fn()
      .mockRejectedValue(new Error("Clipboard error"));
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const result = await copyToClipboard("hello");
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("returns false and warns when clipboard API is unavailable", async () => {
    // Temporarily remove clipboard
    const original = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const result = await copyToClipboard("hello");
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    // Restore
    Object.defineProperty(navigator, "clipboard", {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  it("passes the exact text to clipboard.writeText", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    const jsonText = '{"key":"value","num":42}';
    await copyToClipboard(jsonText);
    expect(writeTextMock).toHaveBeenCalledWith(jsonText);
  });
});
