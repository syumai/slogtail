import { describe, it, expect } from "vitest";
import { parseRelayArgs, parseLine } from "./relay";

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
    ]);
    expect(opts).toEqual({
      url: "http://localhost:3000",
      service: "gateway",
      batchSize: 200,
      intervalMs: 250,
      help: false,
    });
  });
});

describe("parseLine", () => {
  const cases: {
    name: string;
    line: string;
    service: string | undefined;
    expected: Record<string, unknown> | null;
  }[] = [
    { name: "valid JSON object", line: '{"level":"INFO","message":"hello"}', service: undefined, expected: { level: "INFO", message: "hello" } },
    { name: "non-JSON plain text", line: "[WARN] plain text log", service: undefined, expected: { message: "[WARN] plain text log", level: "INFO" } },
    { name: "truncated JSON", line: '{"level":"INFO', service: undefined, expected: { message: '{"level":"INFO', level: "INFO" } },
    { name: "malformed JSON braces", line: "{{{malformed", service: undefined, expected: { message: "{{{malformed", level: "INFO" } },
    { name: "empty string", line: "", service: undefined, expected: null },
    { name: "whitespace only", line: "   ", service: undefined, expected: null },
    { name: "JSON array", line: "[1, 2, 3]", service: undefined, expected: null },
    { name: "JSON number", line: "42", service: undefined, expected: null },
    { name: "JSON string", line: '"just a string"', service: undefined, expected: null },
    { name: "injects service when missing", line: '{"level":"INFO"}', service: "api", expected: { level: "INFO", service: "api" } },
    { name: "preserves existing service", line: '{"level":"INFO","service":"auth"}', service: "api", expected: { level: "INFO", service: "auth" } },
    { name: "injects service into non-JSON", line: "plain text", service: "gateway", expected: { message: "plain text", level: "INFO", service: "gateway" } },
  ];

  it.each(cases)("$name", ({ line, service, expected }) => {
    expect(parseLine(line, service)).toEqual(expected);
  });
});
