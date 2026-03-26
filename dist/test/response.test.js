import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSdkResponse, extractText, extractStructuredOutput, isStructuredOutputError, formatTextOutput, formatJsonOutput, } from "../src/response.js";
function makeResult(parts, info) {
    return {
        data: {
            info: info ?? { id: "msg-1", sessionID: "sess-1", role: "assistant" },
            parts,
        },
    };
}
function makeMinimalResult() {
    return { data: undefined };
}
describe("response.normalizeSdkResponse", () => {
    it("extracts text parts", () => {
        const result = makeResult([{ type: "text", text: "hello world" }]);
        const normalized = normalizeSdkResponse(result);
        assert.equal(normalized.text, "hello world");
        assert.equal(normalized.otherParts.length, 0);
    });
    it("extracts structured output from info", () => {
        const result = makeResult([{ type: "text", text: "done" }], { id: "m1", sessionID: "s1", role: "assistant", structured: { key: "value" } });
        const normalized = normalizeSdkResponse(result);
        assert.deepEqual(normalized.structuredOutput, { key: "value" });
    });
    it("returns null text when no text parts", () => {
        const result = makeResult([{ type: "tool_use", name: "search" }]);
        const normalized = normalizeSdkResponse(result);
        assert.equal(normalized.text, null);
        assert.equal(normalized.otherParts.length, 1);
    });
    it("concatenates multiple text parts", () => {
        const result = makeResult([
            { type: "text", text: "line1" },
            { type: "text", text: "line2" },
        ]);
        const normalized = normalizeSdkResponse(result);
        assert.equal(normalized.text, "line1\nline2");
    });
    it("extracts error from info", () => {
        const result = makeResult([], {
            id: "m1", sessionID: "s1", role: "assistant",
            error: { name: "StructuredOutputError", data: { message: "schema mismatch", retries: 3 } },
        });
        const normalized = normalizeSdkResponse(result);
        assert.ok(normalized.error);
        assert.equal(normalized.error.name, "StructuredOutputError");
        assert.equal(normalized.error.retries, 3);
    });
    it("handles missing data", () => {
        const normalized = normalizeSdkResponse({ error: "something" });
        assert.equal(normalized.text, null);
        assert.equal(normalized.info, null);
    });
    it("handles undefined data", () => {
        const normalized = normalizeSdkResponse({ data: undefined });
        assert.equal(normalized.text, null);
        assert.equal(normalized.info, null);
        assert.equal(normalized.parts.length, 0);
    });
    it("handles null info", () => {
        const normalized = normalizeSdkResponse({ data: { info: null, parts: [] } });
        assert.equal(normalized.info, null);
        assert.equal(normalized.error, null);
        assert.equal(normalized.structuredOutput, null);
    });
    it("extracts error message correctly", () => {
        const result = makeResult([], {
            id: "m1", sessionID: "s1", role: "assistant",
            error: { name: "ValidationError", data: { message: "Invalid input", retries: 0 } },
        });
        const normalized = normalizeSdkResponse(result);
        assert.equal(normalized.error?.name, "ValidationError");
        assert.equal(normalized.error?.message, "Invalid input");
        assert.equal(normalized.error?.retries, 0);
    });
    it("returns null error when no error in info", () => {
        const result = makeResult([{ type: "text", text: "hello" }]);
        const normalized = normalizeSdkResponse(result);
        assert.equal(normalized.error, null);
    });
});
describe("response.extractText", () => {
    it("returns text from normalized response", () => {
        const nr = normalizeSdkResponse(makeResult([{ type: "text", text: "hi" }]));
        assert.equal(extractText(nr), "hi");
    });
    it("returns null when no text", () => {
        const nr = normalizeSdkResponse(makeResult([]));
        assert.equal(extractText(nr), null);
    });
});
describe("response.extractStructuredOutput", () => {
    it("returns structured output", () => {
        const nr = normalizeSdkResponse(makeResult([], { id: "m1", sessionID: "s1", role: "assistant", structured: { a: 1 } }));
        assert.deepEqual(extractStructuredOutput(nr), { a: 1 });
    });
    it("returns null when no structured output", () => {
        const nr = normalizeSdkResponse(makeResult([]));
        assert.equal(extractStructuredOutput(nr), null);
    });
});
describe("response.isStructuredOutputError", () => {
    it("identifies StructuredOutputError", () => {
        assert.equal(isStructuredOutputError({ name: "StructuredOutputError" }), true);
    });
    it("returns false for other errors", () => {
        assert.equal(isStructuredOutputError({ name: "OtherError" }), false);
    });
    it("returns false for null", () => {
        assert.equal(isStructuredOutputError(null), false);
    });
});
describe("response.formatTextOutput", () => {
    it("returns text when available", () => {
        const nr = normalizeSdkResponse(makeResult([{ type: "text", text: "result" }]));
        assert.equal(formatTextOutput(nr), "result");
    });
    it("returns structured as JSON when no text", () => {
        const nr = normalizeSdkResponse(makeResult([], { id: "m1", sessionID: "s1", role: "assistant", structured: { x: 1 } }));
        assert.equal(formatTextOutput(nr), JSON.stringify({ x: 1 }, null, 2));
    });
    it("returns placeholder when nothing", () => {
        const nr = normalizeSdkResponse(makeResult([]));
        assert.ok(formatTextOutput(nr).includes("No text content"));
    });
});
describe("response.formatJsonOutput", () => {
    it("includes structured and text", () => {
        const nr = normalizeSdkResponse(makeResult([{ type: "text", text: "hello" }], { id: "m1", sessionID: "s1", role: "assistant", structured: { k: "v" } }));
        const output = JSON.parse(formatJsonOutput(nr));
        assert.deepEqual(output.structured, { k: "v" });
        assert.equal(output.text, "hello");
    });
    it("includes error", () => {
        const nr = normalizeSdkResponse(makeResult([], {
            id: "m1", sessionID: "s1", role: "assistant",
            error: { name: "StructuredOutputError", data: { message: "fail", retries: 1 } },
        }));
        const output = JSON.parse(formatJsonOutput(nr));
        assert.equal(output.error.name, "StructuredOutputError");
    });
});
