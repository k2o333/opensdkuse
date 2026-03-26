import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPromptTemplate, validatePromptTemplate, buildUserTask } from "../src/prompt.js";
import { AppError } from "../src/errors.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TEST_DIR = join(__dirname, "..", ".test-tmp");

describe("prompt.loadPromptTemplate", () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    try { unlinkSync(join(TEST_DIR, "valid.md")); } catch {}
    try { unlinkSync(join(TEST_DIR, "empty.md")); } catch {}
    try { unlinkSync(join(TEST_DIR, "whitespace.md")); } catch {}
  });

  it("throws PROMPT_FILE_NOT_FOUND for missing file", () => {
    assert.throws(
      () => loadPromptTemplate(join(TEST_DIR, "nonexistent.md")),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_NOT_FOUND",
    );
  });

  it("throws PROMPT_FILE_EMPTY for empty file", () => {
    const emptyPath = join(TEST_DIR, "empty.md");
    writeFileSync(emptyPath, "");
    assert.throws(
      () => loadPromptTemplate(emptyPath),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_EMPTY",
    );
  });

  it("throws PROMPT_FILE_WHITESPACE_ONLY for whitespace-only file", () => {
    const wsPath = join(TEST_DIR, "whitespace.md");
    writeFileSync(wsPath, "   \n\t  \n");
    assert.throws(
      () => loadPromptTemplate(wsPath),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_WHITESPACE_ONLY",
    );
  });

  it("loads valid UTF-8 file", () => {
    const validPath = join(TEST_DIR, "valid.md");
    writeFileSync(validPath, "# My Prompt\nDo things.");
    const content = loadPromptTemplate(validPath);
    assert.equal(content, "# My Prompt\nDo things.");
  });
});

describe("prompt.validatePromptTemplate", () => {
  it("accepts valid content", () => {
    assert.doesNotThrow(() => validatePromptTemplate("hello", 1000));
  });

  it("rejects empty content", () => {
    assert.throws(
      () => validatePromptTemplate("", 1000),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_EMPTY",
    );
  });

  it("rejects whitespace-only content", () => {
    assert.throws(
      () => validatePromptTemplate("   \n  ", 1000),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_WHITESPACE_ONLY",
    );
  });

  it("rejects too-long content", () => {
    const long = "a".repeat(1001);
    assert.throws(
      () => validatePromptTemplate(long, 1000),
      (err: any) => err instanceof AppError && err.code === "PROMPT_FILE_TOO_LONG",
    );
  });
});

describe("prompt.buildUserTask", () => {
  it("trims whitespace", () => {
    assert.equal(buildUserTask("  hello  "), "hello");
  });

  it("preserves content", () => {
    assert.equal(buildUserTask("do something"), "do something");
  });
});
