import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSdkResponse,
  extractText,
  extractStructuredOutput,
  isStructuredOutputError,
  formatTextOutput,
  formatJsonOutput,
  type SdkPromptResult,
  type NormalizedResponse,
} from "../src/response.js";

function makeResult(parts: any[], info?: any): SdkPromptResult {
  return {
    data: {
      info: info ?? { id: "msg-1", sessionID: "sess-1", role: "assistant" },
      parts,
    },
  };
}

function makeMinimalResult(): SdkPromptResult {
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
    const result = makeResult(
      [{ type: "text", text: "done" }],
      { id: "m1", sessionID: "s1", role: "assistant", structured: { key: "value" } },
    );
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
    const result = makeResult(
      [],
      {
        id: "m1", sessionID: "s1", role: "assistant",
        error: { name: "StructuredOutputError", data: { message: "schema mismatch", retries: 3 } },
      },
    );
    const normalized = normalizeSdkResponse(result);
    assert.ok(normalized.error);
    assert.equal(normalized.error!.name, "StructuredOutputError");
    assert.equal(normalized.error!.retries, 3);
  });

  it("handles missing data", () => {
    const normalized = normalizeSdkResponse({ error: "something" } as any);
    assert.equal(normalized.text, null);
    assert.equal(normalized.info, null);
  });

  it("handles undefined data", () => {
    const normalized = normalizeSdkResponse({ data: undefined } as any);
    assert.equal(normalized.text, null);
    assert.equal(normalized.info, null);
    assert.equal(normalized.parts.length, 0);
  });

  it("handles null info", () => {
    const normalized = normalizeSdkResponse({ data: { info: null, parts: [] } } as any);
    assert.equal(normalized.info, null);
    assert.equal(normalized.error, null);
    assert.equal(normalized.structuredOutput, null);
  });

  it("extracts error message correctly", () => {
    const result = makeResult(
      [],
      {
        id: "m1", sessionID: "s1", role: "assistant",
        error: { name: "ValidationError", data: { message: "Invalid input", retries: 0 } },
      },
    );
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

  it("normalizes top-level result.error when info.error is absent", () => {
    const result = { error: "SDK error occurred" } as unknown as SdkPromptResult;
    const normalized = normalizeSdkResponse(result);
    assert.ok(normalized.error !== null);
    assert.equal(normalized.error?.message, "SDK error occurred");
  });

  it("prefers info.error over top-level result.error", () => {
    const result = {
      data: {
        info: { id: "m1", sessionID: "s1", role: "assistant", error: { name: "InfoError", data: { message: "from info" } } },
        parts: [],
      },
      error: "top-level error",
    };
    const normalized = normalizeSdkResponse(result);
    assert.ok(normalized.error !== null);
    assert.equal(normalized.error?.name, "InfoError");
    assert.equal(normalized.error?.message, "from info");
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
    const nr = normalizeSdkResponse(
      makeResult([], { id: "m1", sessionID: "s1", role: "assistant", structured: { a: 1 } }),
    );
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
    const nr = normalizeSdkResponse(
      makeResult([], { id: "m1", sessionID: "s1", role: "assistant", structured: { x: 1 } }),
    );
    assert.equal(formatTextOutput(nr), JSON.stringify({ x: 1 }, null, 2));
  });

  it("returns placeholder when nothing", () => {
    const nr = normalizeSdkResponse(makeResult([]));
    assert.ok(formatTextOutput(nr).includes("No text content"));
  });

  it("surfaces non-text part types when model returns no text", () => {
    const nr = normalizeSdkResponse(
      makeResult([
        { type: "tool_use", name: "search" },
        { type: "tool_result", result: "done" },
      ]),
    );
    const output = formatTextOutput(nr);
    assert.ok(output.includes("tool_use"));
    assert.ok(output.includes("tool_result"));
  });

  it("surfaces model error summary instead of empty placeholder", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [],
        {
          id: "m1", sessionID: "s1", role: "assistant",
          error: { name: "APIError", message: "invalid api key" },
        },
      ),
    );
    const output = formatTextOutput(nr);
    assert.ok(output.includes("APIError"));
    assert.ok(output.includes("invalid api key"));
    assert.equal(output.includes("No text content returned from model"), false);
  });
});

describe("response.formatJsonOutput", () => {
  it("includes result and text when structured output present", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [{ type: "text", text: "hello" }],
        { id: "m1", sessionID: "s1", role: "assistant", structured: { k: "v" } },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.deepEqual(output.result, { k: "v" });
    assert.equal(output.text, null);
    assert.equal(output.mode, "structured");
  });

  it("includes error", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [],
        {
          id: "m1", sessionID: "s1", role: "assistant",
          error: { name: "StructuredOutputError", data: { message: "fail", retries: 1 } },
        },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.error.name, "StructuredOutputError");
  });
});

describe("response.extractErrorFromInfo - fallback", () => {
  it("extracts error.message as fallback when data.message is absent", () => {
    const result = makeResult(
      [],
      {
        id: "m1", sessionID: "s1", role: "assistant",
        error: { name: "SomeError", message: "fallback message" },
      },
    );
    const normalized = normalizeSdkResponse(result);
    assert.equal(normalized.error?.message, "fallback message");
  });

  it("prefers data.message over error.message when both present", () => {
    const result = makeResult(
      [],
      {
        id: "m1", sessionID: "s1", role: "assistant",
        error: { name: "SomeError", message: "error msg", data: { message: "data msg", retries: 2 } },
      },
    );
    const normalized = normalizeSdkResponse(result);
    assert.equal(normalized.error?.message, "data msg");
    assert.equal(normalized.error?.retries, 2);
  });

  it("returns undefined message when neither data.message nor error.message exists", () => {
    const result = makeResult(
      [],
      {
        id: "m1", sessionID: "s1", role: "assistant",
        error: { name: "SomeError" },
      },
    );
    const normalized = normalizeSdkResponse(result);
    assert.equal(normalized.error?.message, undefined);
  });
});

describe("response.formatJsonOutput - mode契约", () => {
  it("outputs mode=structured with result when structuredOutput present", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [{ type: "text", text: "hello" }],
        { id: "m1", sessionID: "sess-1", role: "assistant", structured: { key: "value" } },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.mode, "structured");
    assert.deepEqual(output.result, { key: "value" });
    assert.equal(output.text, null);
    assert.equal(output.error, null);
  });

  it("outputs mode=text with text when only text parts present", () => {
    const nr = normalizeSdkResponse(
      makeResult([{ type: "text", text: "hello" }]),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.mode, "text");
    assert.equal(output.text, "hello");
    assert.equal(output.result, null);
    assert.equal(output.error, null);
  });

  it("outputs mode=error when error present", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [],
        {
          id: "m1", sessionID: "s1", role: "assistant",
          error: { name: "StructuredOutputError", data: { message: "fail", retries: 1 } },
        },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.mode, "error");
    assert.ok(output.error);
    assert.equal(output.result, null);
    assert.equal(output.text, null);
  });

  it("outputs mode=error even when both error and structuredOutput present", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [{ type: "text", text: "done" }],
        {
          id: "m1", sessionID: "s1", role: "assistant",
          structured: { key: "value" },
          error: { name: "StructuredOutputError", data: { message: "fail", retries: 1 } },
        },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.mode, "error");
    assert.ok(output.error);
    assert.equal(output.result, null);
  });

  it("includes sessionId from info.sessionID", () => {
    const nr = normalizeSdkResponse(
      makeResult(
        [{ type: "text", text: "hello" }],
        { id: "m1", sessionID: "sess-1", role: "assistant" },
      ),
    );
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.sessionId, "sess-1");
  });

  it("returns null sessionId when info is null", () => {
    const nr = normalizeSdkResponse({ data: { info: null, parts: [] } } as any);
    const output = JSON.parse(formatJsonOutput(nr));
    assert.equal(output.sessionId, null);
  });
});
