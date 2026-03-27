import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../src/logger.js";

describe("logger.createLogger - debug=false", () => {
  it("does not call console.error for debug messages", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.debug("should be suppressed");
      assert.equal(calls.length, 0);
    } finally {
      console.error = origError;
    }
  });

  it("still outputs info messages", () => {
    const logger = createLogger(false, true);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.info("visible info");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[INFO]"));
      assert.ok(calls[0].includes("visible info"));
    } finally {
      console.error = origError;
    }
  });

  it("still outputs error messages", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.error("visible error");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[ERROR]"));
    } finally {
      console.error = origError;
    }
  });
});

describe("logger.createLogger - info behavior", () => {
  it("createLogger(false, false) suppresses info", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.info("should be suppressed");
      assert.equal(calls.length, 0);
    } finally {
      console.error = origError;
    }
  });

  it("createLogger(false, true) prints info", () => {
    const logger = createLogger(false, true);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.info("visible info");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[INFO]"));
      assert.ok(calls[0].includes("visible info"));
    } finally {
      console.error = origError;
    }
  });

  it("createLogger(true, true) prints debug", () => {
    const logger = createLogger(true, true);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.debug("visible debug");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[DEBUG]"));
    } finally {
      console.error = origError;
    }
  });

  it("--debug implies --info (debug shows info)", () => {
    const logger = createLogger(true, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.info("info with debug flag");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[INFO]"));
    } finally {
      console.error = origError;
    }
  });
});

describe("logger.createLogger - debug=true", () => {
  it("outputs debug messages", () => {
    const logger = createLogger(true, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.debug("visible debug");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].includes("[DEBUG]"));
      assert.ok(calls[0].includes("visible debug"));
    } finally {
      console.error = origError;
    }
  });
});

describe("logger.separator", () => {
  it("uses default char and count", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.separator();
      assert.equal(calls.length, 1);
      assert.equal(calls[0], "-".repeat(40));
    } finally {
      console.error = origError;
    }
  });

  it("accepts custom char and count", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.separator("=", 10);
      assert.equal(calls[0], "=".repeat(10));
    } finally {
      console.error = origError;
    }
  });
});

describe("logger.log", () => {
  it("writes to console.log", () => {
    const logger = createLogger(false, false);
    const calls: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => { calls.push(args.join(" ")); };
    try {
      logger.log("hello log");
      assert.equal(calls.length, 1);
      assert.equal(calls[0], "hello log");
    } finally {
      console.log = origLog;
    }
  });
});
