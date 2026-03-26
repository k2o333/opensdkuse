import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError, getExitCode } from "../src/errors.js";
describe("AppError", () => {
    it("stores code, message, and cause", () => {
        const cause = new Error("root cause");
        const err = new AppError("SESSION_CREATE_FAILED", "session failed", cause);
        assert.equal(err.code, "SESSION_CREATE_FAILED");
        assert.equal(err.message, "session failed");
        assert.equal(err.cause, cause);
        assert.equal(err.name, "AppError");
    });
    it("works without cause", () => {
        const err = new AppError("TIMEOUT", "timed out");
        assert.equal(err.code, "TIMEOUT");
        assert.equal(err.cause, undefined);
    });
    it("is an instance of Error", () => {
        const err = new AppError("UNKNOWN", "oops");
        assert.ok(err instanceof Error);
        assert.ok(err instanceof AppError);
    });
});
describe("getExitCode", () => {
    it("returns 2 for input/config errors", () => {
        assert.equal(getExitCode("INPUT_INVALID"), 2);
        assert.equal(getExitCode("CONFIG_INVALID"), 2);
        assert.equal(getExitCode("PROMPT_FILE_NOT_FOUND"), 2);
        assert.equal(getExitCode("PROMPT_FILE_EMPTY"), 2);
        assert.equal(getExitCode("PROMPT_FILE_WHITESPACE_ONLY"), 2);
        assert.equal(getExitCode("PROMPT_FILE_DECODE_FAILED"), 2);
        assert.equal(getExitCode("PROMPT_FILE_TOO_LONG"), 2);
    });
    it("returns 3 for timeout", () => {
        assert.equal(getExitCode("TIMEOUT"), 3);
    });
    it("returns 130 for interrupted", () => {
        assert.equal(getExitCode("INTERRUPTED"), 130);
    });
    it("returns 1 for server/session errors", () => {
        assert.equal(getExitCode("ATTACH_FAILED"), 1);
        assert.equal(getExitCode("HEALTHCHECK_FAILED"), 1);
        assert.equal(getExitCode("SPAWN_FAILED"), 1);
        assert.equal(getExitCode("SESSION_CREATE_FAILED"), 1);
        assert.equal(getExitCode("SESSION_PROMPT_FAILED"), 1);
        assert.equal(getExitCode("SESSION_ABORT_FAILED"), 1);
        assert.equal(getExitCode("SESSION_DELETE_FAILED"), 1);
        assert.equal(getExitCode("STRUCTURED_OUTPUT_FAILED"), 1);
    });
    it("returns 1 for UNKNOWN", () => {
        assert.equal(getExitCode("UNKNOWN"), 1);
    });
});
