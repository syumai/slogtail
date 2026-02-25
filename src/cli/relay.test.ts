import { describe, it, expect, vi } from "vitest";
import { parseRelayArgs, parseLine, flushWithRetry, computeBackoffDelay, accumulateFlushResult, formatRelaySummary } from "./relay";
import type { FlushResult, RelaySummary } from "./relay";

describe("parseRelayArgs", () => {
  // -------------------------------------------------------------------------
  // Default values
  // -------------------------------------------------------------------------

  it("returns default values when no arguments are provided", () => {
    const opts = parseRelayArgs([]);
    expect(opts).toEqual({
      url: "http://localhost:8080",
      service: undefined,
      batchSize: 100,
      intervalMs: 500,
      maxRetries: 3,
      help: false,
    });
  });

  // -------------------------------------------------------------------------
  // URL option
  // -------------------------------------------------------------------------

  it("parses --url option", () => {
    const opts = parseRelayArgs(["--url", "http://myserver:9090"]);
    expect(opts.url).toBe("http://myserver:9090");
  });

  it("parses -u short flag", () => {
    const opts = parseRelayArgs(["-u", "http://myserver:9090"]);
    expect(opts.url).toBe("http://myserver:9090");
  });

  // -------------------------------------------------------------------------
  // Service option
  // -------------------------------------------------------------------------

  it("parses --service option", () => {
    const opts = parseRelayArgs(["--service", "api"]);
    expect(opts.service).toBe("api");
  });

  it("parses -s short flag", () => {
    const opts = parseRelayArgs(["-s", "worker"]);
    expect(opts.service).toBe("worker");
  });

  // -------------------------------------------------------------------------
  // Batch size option
  // -------------------------------------------------------------------------

  it("parses --batch-size option", () => {
    const opts = parseRelayArgs(["--batch-size", "50"]);
    expect(opts.batchSize).toBe(50);
  });

  // -------------------------------------------------------------------------
  // Interval option
  // -------------------------------------------------------------------------

  it("parses --interval option", () => {
    const opts = parseRelayArgs(["--interval", "1000"]);
    expect(opts.intervalMs).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // Help flag
  // -------------------------------------------------------------------------

  it("parses --help flag", () => {
    const opts = parseRelayArgs(["--help"]);
    expect(opts.help).toBe(true);
  });

  it("parses -h short flag", () => {
    const opts = parseRelayArgs(["-h"]);
    expect(opts.help).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Combined options
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Max retries option
  // -------------------------------------------------------------------------

  it("parses --max-retries option", () => {
    const opts = parseRelayArgs(["--max-retries", "5"]);
    expect(opts.maxRetries).toBe(5);
  });

  it("defaults maxRetries to 3", () => {
    const opts = parseRelayArgs([]);
    expect(opts.maxRetries).toBe(3);
  });

  it("parses --max-retries 0 to disable retries", () => {
    const opts = parseRelayArgs(["--max-retries", "0"]);
    expect(opts.maxRetries).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Combined options
  // -------------------------------------------------------------------------

  it("parses multiple options together", () => {
    const opts = parseRelayArgs([
      "-u",
      "http://localhost:3000",
      "-s",
      "gateway",
      "--batch-size",
      "200",
      "--interval",
      "250",
      "--max-retries",
      "5",
    ]);
    expect(opts).toEqual({
      url: "http://localhost:3000",
      service: "gateway",
      batchSize: 200,
      intervalMs: 250,
      maxRetries: 5,
      help: false,
    });
  });
});

describe("parseLine", () => {
  // Cases where the result can be compared with toEqual (no dynamic fields)
  const exactCases: {
    name: string;
    line: string;
    service: string | undefined;
    expected: Record<string, unknown> | null;
  }[] = [
    { name: "valid JSON object", line: '{"level":"INFO","message":"hello"}', service: undefined, expected: { level: "INFO", message: "hello" } },
    { name: "empty string", line: "", service: undefined, expected: null },
    { name: "whitespace only", line: "   ", service: undefined, expected: null },
    { name: "JSON array", line: "[1, 2, 3]", service: undefined, expected: null },
    { name: "JSON number", line: "42", service: undefined, expected: null },
    { name: "JSON string", line: '"just a string"', service: undefined, expected: null },
    { name: "injects service when missing", line: '{"level":"INFO"}', service: "api", expected: { level: "INFO", service: "api" } },
    { name: "preserves existing service", line: '{"level":"INFO","service":"auth"}', service: "api", expected: { level: "INFO", service: "auth" } },
  ];

  it.each(exactCases)("$name", ({ line, service, expected }) => {
    expect(parseLine(line, service)).toEqual(expected);
  });

  // Cases for non-JSON lines (contain dynamic timestamp)
  const nonJsonCases: {
    name: string;
    line: string;
    service: string | undefined;
    expectedMessage: string;
    expectedService?: string;
  }[] = [
    { name: "non-JSON plain text", line: "[WARN] plain text log", service: undefined, expectedMessage: "[WARN] plain text log" },
    { name: "truncated JSON", line: '{"level":"INFO', service: undefined, expectedMessage: '{"level":"INFO' },
    { name: "malformed JSON braces", line: "{{{malformed", service: undefined, expectedMessage: "{{{malformed" },
    { name: "injects service into non-JSON", line: "plain text", service: "gateway", expectedMessage: "plain text", expectedService: "gateway" },
  ];

  it.each(nonJsonCases)("$name", ({ line, service, expectedMessage, expectedService }) => {
    const result = parseLine(line, service);
    expect(result).not.toBeNull();
    expect(result!.message).toBe(expectedMessage);
    expect(result!.level).toBe("INFO");
    expect(typeof result!.timestamp).toBe("string");
    if (expectedService !== undefined) {
      expect(result!.service).toBe(expectedService);
    }
  });
});

// ---------------------------------------------------------------------------
// computeBackoffDelay
// ---------------------------------------------------------------------------

describe("computeBackoffDelay", () => {
  it("returns baseDelay for attempt 0", () => {
    expect(computeBackoffDelay(0, 100, 30_000)).toBe(100);
  });

  it("doubles delay for each attempt", () => {
    expect(computeBackoffDelay(1, 100, 30_000)).toBe(200);
    expect(computeBackoffDelay(2, 100, 30_000)).toBe(400);
    expect(computeBackoffDelay(3, 100, 30_000)).toBe(800);
  });

  it("caps delay at maxDelay", () => {
    // 100 * 2^10 = 102400, but cap is 30000
    expect(computeBackoffDelay(10, 100, 30_000)).toBe(30_000);
  });

  it("handles edge case where baseDelay exceeds maxDelay", () => {
    expect(computeBackoffDelay(0, 50_000, 30_000)).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// flushWithRetry
// ---------------------------------------------------------------------------

describe("flushWithRetry", () => {
  // Use fake timers so exponential backoff delays don't slow tests
  it("returns accepted count on immediate success", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>().mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: 5 }), { status: 200 }),
    );

    const result = await flushWithRetry(
      [{ msg: "a" }, { msg: "b" }, { msg: "c" }, { msg: "d" }, { msg: "e" }],
      "http://localhost:8080/api/ingest",
      3,
      mockFetch,
    );

    expect(result).toEqual<FlushResult>({ accepted: 5, errors: 0, retries: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on server error and succeeds", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: 3 }), { status: 200 }),
      );

    const result = await flushWithRetry(
      [{ msg: "a" }, { msg: "b" }, { msg: "c" }],
      "http://localhost:8080/api/ingest",
      3,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    expect(result).toEqual<FlushResult>({ accepted: 3, errors: 0, retries: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on network error and succeeds", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: 2 }), { status: 200 }),
      );

    const result = await flushWithRetry(
      [{ msg: "a" }, { msg: "b" }],
      "http://localhost:8080/api/ingest",
      3,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    expect(result).toEqual<FlushResult>({ accepted: 2, errors: 0, retries: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns errors when max retries exhausted", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response("Server Error", { status: 500 }));

    const result = await flushWithRetry(
      [{ msg: "a" }, { msg: "b" }],
      "http://localhost:8080/api/ingest",
      3,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    // initial attempt + 3 retries = 4 total calls
    expect(result).toEqual<FlushResult>({ accepted: 0, errors: 2, retries: 3 });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("returns errors when max retries exhausted on network errors", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockRejectedValue(new Error("Network unreachable"));

    const result = await flushWithRetry(
      [{ msg: "a" }],
      "http://localhost:8080/api/ingest",
      2,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    // initial attempt + 2 retries = 3 total calls
    expect(result).toEqual<FlushResult>({ accepted: 0, errors: 1, retries: 2 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry when maxRetries is 0", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response("Server Error", { status: 500 }));

    const result = await flushWithRetry(
      [{ msg: "a" }],
      "http://localhost:8080/api/ingest",
      0,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    expect(result).toEqual<FlushResult>({ accepted: 0, errors: 1, retries: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends correct JSON body and headers", async () => {
    const batch = [{ level: "INFO", message: "test" }];
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>().mockResolvedValueOnce(
      new Response(JSON.stringify({ accepted: 1 }), { status: 200 }),
    );

    await flushWithRetry(batch, "http://example.com/api/ingest", 3, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith("http://example.com/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    });
  });

  it("does not retry on 4xx client errors", async () => {
    const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(new Response("Bad Request", { status: 400 }));

    const result = await flushWithRetry(
      [{ msg: "a" }],
      "http://localhost:8080/api/ingest",
      3,
      mockFetch,
      { baseDelay: 1, maxDelay: 10 },
    );

    // 4xx errors should not be retried - only 1 call
    expect(result).toEqual<FlushResult>({ accepted: 0, errors: 1, retries: 0 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// accumulateFlushResult
// ---------------------------------------------------------------------------

describe("accumulateFlushResult", () => {
  it("accumulates a successful FlushResult into an empty summary", () => {
    const summary: RelaySummary = { totalSent: 0, totalErrors: 0, totalRetries: 0 };
    const result: FlushResult = { accepted: 5, errors: 0, retries: 0 };

    const updated = accumulateFlushResult(summary, result);

    expect(updated).toEqual<RelaySummary>({
      totalSent: 5,
      totalErrors: 0,
      totalRetries: 0,
    });
  });

  it("accumulates a failed FlushResult with retries", () => {
    const summary: RelaySummary = { totalSent: 10, totalErrors: 0, totalRetries: 1 };
    const result: FlushResult = { accepted: 0, errors: 3, retries: 3 };

    const updated = accumulateFlushResult(summary, result);

    expect(updated).toEqual<RelaySummary>({
      totalSent: 10,
      totalErrors: 3,
      totalRetries: 4,
    });
  });

  it("accumulates multiple FlushResults correctly", () => {
    let summary: RelaySummary = { totalSent: 0, totalErrors: 0, totalRetries: 0 };

    summary = accumulateFlushResult(summary, { accepted: 10, errors: 0, retries: 0 });
    summary = accumulateFlushResult(summary, { accepted: 5, errors: 0, retries: 2 });
    summary = accumulateFlushResult(summary, { accepted: 0, errors: 3, retries: 3 });

    expect(summary).toEqual<RelaySummary>({
      totalSent: 15,
      totalErrors: 3,
      totalRetries: 5,
    });
  });

  it("does not mutate the original summary", () => {
    const summary: RelaySummary = { totalSent: 5, totalErrors: 1, totalRetries: 2 };
    const result: FlushResult = { accepted: 3, errors: 0, retries: 0 };

    const updated = accumulateFlushResult(summary, result);

    expect(summary).toEqual<RelaySummary>({ totalSent: 5, totalErrors: 1, totalRetries: 2 });
    expect(updated).toEqual<RelaySummary>({ totalSent: 8, totalErrors: 1, totalRetries: 2 });
  });
});

// ---------------------------------------------------------------------------
// formatRelaySummary
// ---------------------------------------------------------------------------

describe("formatRelaySummary", () => {
  it("formats a summary with all zeros", () => {
    const summary: RelaySummary = { totalSent: 0, totalErrors: 0, totalRetries: 0 };
    expect(formatRelaySummary(summary)).toBe(
      "[relay] Done. Sent: 0, Errors: 0, Retries: 0",
    );
  });

  it("formats a summary with successful sends", () => {
    const summary: RelaySummary = { totalSent: 42, totalErrors: 0, totalRetries: 0 };
    expect(formatRelaySummary(summary)).toBe(
      "[relay] Done. Sent: 42, Errors: 0, Retries: 0",
    );
  });

  it("formats a summary with errors and retries", () => {
    const summary: RelaySummary = { totalSent: 100, totalErrors: 5, totalRetries: 8 };
    expect(formatRelaySummary(summary)).toBe(
      "[relay] Done. Sent: 100, Errors: 5, Retries: 8",
    );
  });

  it("formats a summary with only errors", () => {
    const summary: RelaySummary = { totalSent: 0, totalErrors: 10, totalRetries: 3 };
    expect(formatRelaySummary(summary)).toBe(
      "[relay] Done. Sent: 0, Errors: 10, Retries: 3",
    );
  });
});
