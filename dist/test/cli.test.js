import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, validateInput, showHelp } from "../src/cli.js";
import { AppError } from "../src/errors.js";
describe("cli.parseArgs", () => {
    it("parses --debug flag", () => {
        const args = parseArgs(["--debug", "hello"]);
        assert.equal(args.debug, true);
        assert.equal(args.userInput, "hello");
    });
    it("handles -- as terminator", () => {
        const args = parseArgs(["--debug", "--", "--not-a-flag"]);
        assert.equal(args.debug, true);
        assert.equal(args.userInput, "--not-a-flag");
    });
    it("throws on unknown argument", () => {
        assert.throws(() => parseArgs(["--unknown"]), (err) => err instanceof AppError && err.code === "CONFIG_INVALID");
    });
    it("throws on empty input", () => {
        const args = parseArgs([]);
        assert.throws(() => validateInput(args.userInput, 100000), (err) => err instanceof AppError && err.code === "INPUT_INVALID");
    });
    it("parses all flags correctly", () => {
        const args = parseArgs([
            "--debug",
            "--info",
            "--keep-session",
            "--json",
            "--model", "test/model",
            "--host", "10.0.0.1",
            "--port", "8080",
            "--prompt", "custom.md",
            "--timeout", "5000",
            "--agent", "coder",
            "do something",
        ]);
        assert.equal(args.debug, true);
        assert.equal(args.info, true);
        assert.equal(args.keepSession, true);
        assert.equal(args.json, true);
        assert.equal(args.model, "test/model");
        assert.equal(args.host, "10.0.0.1");
        assert.equal(args.port, 8080);
        assert.equal(args.promptFile, "custom.md");
        assert.equal(args.timeoutMs, 5000);
        assert.equal(args.agent, "coder");
        assert.equal(args.userInput, "do something");
    });
    it("throws on invalid port", () => {
        assert.throws(() => parseArgs(["--port", "abc", "hello"]), (err) => err instanceof AppError && err.code === "CONFIG_INVALID");
    });
    it("throws on negative port", () => {
        assert.throws(() => parseArgs(["--port", "-1", "hello"]), (err) => err instanceof AppError && err.code === "CONFIG_INVALID");
    });
    it("throws on missing value for --model", () => {
        assert.throws(() => parseArgs(["--model"]), (err) => err instanceof AppError && err.code === "CONFIG_INVALID");
    });
    it("--help triggers showHelp", () => {
        const args = parseArgs(["--help"]);
        assert.equal(args.showHelp, true);
    });
    it("-h triggers showHelp", () => {
        const args = parseArgs(["-h"]);
        assert.equal(args.showHelp, true);
    });
    it("parses --schema-file with valid path", () => {
        const args = parseArgs(["--schema-file", "schemas/basic.json", "test"]);
        assert.equal(args.schemaFile, "schemas/basic.json");
        assert.equal(args.userInput, "test");
    });
    it("parses --json with --schema-file", () => {
        const args = parseArgs(["--json", "--schema-file", "my-schema.json", "task"]);
        assert.equal(args.json, true);
        assert.equal(args.schemaFile, "my-schema.json");
        assert.equal(args.userInput, "task");
    });
    it("throws on missing value for --schema-file", () => {
        assert.throws(() => parseArgs(["--schema-file"]), (err) => err instanceof AppError && err.code === "CONFIG_INVALID");
    });
});
describe("cli.validateInput", () => {
    it("accepts valid input", () => {
        assert.doesNotThrow(() => validateInput("hello world", 100000));
    });
    it("rejects empty input", () => {
        assert.throws(() => validateInput("", 100000), (err) => err instanceof AppError && err.code === "INPUT_INVALID");
    });
    it("rejects whitespace-only input", () => {
        assert.throws(() => validateInput("   ", 100000), (err) => err instanceof AppError && err.code === "INPUT_INVALID");
    });
    it("rejects too-long input", () => {
        const long = "a".repeat(1001);
        assert.throws(() => validateInput(long, 1000), (err) => err instanceof AppError && err.code === "INPUT_INVALID");
    });
});
describe("cli.showHelp", () => {
    it("returns a non-empty help string", () => {
        const help = showHelp();
        assert.ok(help.length > 0);
        assert.ok(help.includes("USAGE"));
    });
});
