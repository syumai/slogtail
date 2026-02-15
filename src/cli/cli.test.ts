import { describe, it, expect } from "vitest";
import { parseCLIArgs } from "./index";

describe("parseCLIArgs", () => {
  // -------------------------------------------------------------------------
  // Default values
  // -------------------------------------------------------------------------

  it("returns default values when no arguments are provided", () => {
    const opts = parseCLIArgs([]);
    expect(opts).toEqual({
      port: 8080,
      maxRows: 100_000,
      batchSize: 5000,
      db: ":memory:",
      noUi: false,
    });
  });

  // -------------------------------------------------------------------------
  // Custom port
  // -------------------------------------------------------------------------

  it("parses --port option", () => {
    const opts = parseCLIArgs(["--port", "3000"]);
    expect(opts.port).toBe(3000);
  });

  it("parses -p short flag for port", () => {
    const opts = parseCLIArgs(["-p", "9090"]);
    expect(opts.port).toBe(9090);
  });

  // -------------------------------------------------------------------------
  // Custom max-rows
  // -------------------------------------------------------------------------

  it("parses --max-rows option", () => {
    const opts = parseCLIArgs(["--max-rows", "50000"]);
    expect(opts.maxRows).toBe(50_000);
  });

  it("parses -m short flag for max-rows", () => {
    const opts = parseCLIArgs(["-m", "25000"]);
    expect(opts.maxRows).toBe(25_000);
  });

  // -------------------------------------------------------------------------
  // Custom batch-size
  // -------------------------------------------------------------------------

  it("parses --batch-size option", () => {
    const opts = parseCLIArgs(["--batch-size", "1000"]);
    expect(opts.batchSize).toBe(1000);
  });

  // -------------------------------------------------------------------------
  // Custom db path
  // -------------------------------------------------------------------------

  it("parses --db option", () => {
    const opts = parseCLIArgs(["--db", "/tmp/logs.duckdb"]);
    expect(opts.db).toBe("/tmp/logs.duckdb");
  });

  // -------------------------------------------------------------------------
  // --no-ui flag
  // -------------------------------------------------------------------------

  it("parses --no-ui flag", () => {
    const opts = parseCLIArgs(["--no-ui"]);
    expect(opts.noUi).toBe(true);
  });

  it("defaults noUi to false when --no-ui is not provided", () => {
    const opts = parseCLIArgs([]);
    expect(opts.noUi).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Combined options
  // -------------------------------------------------------------------------

  it("parses multiple options together", () => {
    const opts = parseCLIArgs([
      "-p", "4000",
      "-m", "200000",
      "--batch-size", "2000",
      "--db", "./data.db",
      "--no-ui",
    ]);
    expect(opts).toEqual({
      port: 4000,
      maxRows: 200_000,
      batchSize: 2000,
      db: "./data.db",
      noUi: true,
    });
  });

  // -------------------------------------------------------------------------
  // --help flag (returns help: true)
  // -------------------------------------------------------------------------

  it("parses --help flag", () => {
    const opts = parseCLIArgs(["--help"]);
    expect(opts).toHaveProperty("help", true);
  });

  it("parses -h short flag for help", () => {
    const opts = parseCLIArgs(["-h"]);
    expect(opts).toHaveProperty("help", true);
  });
});
