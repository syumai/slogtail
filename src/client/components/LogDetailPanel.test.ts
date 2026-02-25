import { describe, it, expect } from "vitest";
import { flattenObject, EXCLUDED_KEYS } from "./LogDetailPanel";

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
