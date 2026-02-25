import { describe, it, expect } from "vitest";
import { parseRelayArgs } from "./relay";

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
