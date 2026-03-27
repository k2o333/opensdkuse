import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPromptTemplate,
  validatePromptTemplate,
  buildUserTask,
  detectPromptTemplateIssues,
} from "../src/prompt.js";
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

describe("prompt.detectPromptTemplateIssues", () => {
  it("returns empty list for a role-only prompt template", () => {
    const issues = detectPromptTemplateIssues("# Role\nYou are a coding assistant.\nFollow repo conventions.");
    assert.deepEqual(issues, []);
  });

  it("flags templates that appear to embed a concrete user task", () => {
    const issues = detectPromptTemplateIssues(
      "# PRD Planner\n你是产品经理。\n请在 /tmp/out.md 写一个文档给我。\n根据这个代码库现有情况，输出方案。",
    );
    assert.ok(issues.some((issue) => issue.includes("fixed user task")));
  });

  it("flags templates that embed a repo-specific task alongside role description", () => {
    // This mirrors prompts/plan.md which has both role instructions AND a fixed task:
    //   "根据/home/quan/proj/opensdkuse 代码仓库现有的情况" + "在/home/quan/proj/opensdkuse/docs目录写一个文档给我"
    const template = [
      "# 产品需求文档 (PRD) 规划助手",
      "",
      "你是一个专业的产品经理和系统架构师。",
      "",
      "## 你的职责",
      "1. 需求分析",
      "2. 产品规划",
      "",
      "根据/home/quan/proj/opensdkuse 代码仓库现有的情况，",
      "在/home/quan/proj/opensdkuse/docs目录写一个文档给我",
    ].join("\n");
    const issues = detectPromptTemplateIssues(template);
    assert.ok(issues.length > 0, "Expected at least one issue for template with repo-specific task");
    assert.ok(
      issues.some((issue) => issue.includes("fixed user task")),
      "Expected issue message to mention 'fixed user task'",
    );
  });

  it("flags templates with '根据这个代码库' pattern", () => {
    const template = "# Role\n你是一个助手。\n根据这个代码库的结构，生成迁移指南。";
    const issues = detectPromptTemplateIssues(template);
    assert.ok(
      issues.some((issue) => issue.includes("fixed user task")),
      "Expected '根据这个代码库' to be flagged",
    );
  });

  it("warning message is actionable and explains the injection model", () => {
    const template = "# Planner\n根据这个代码库现有情况，在 /tmp/out.md 写方案给我。";
    const issues = detectPromptTemplateIssues(template);
    assert.ok(issues.length > 0);
    const msg = issues[0];
    // Must explain what --prompt does
    assert.ok(msg.includes("--prompt"), "Warning should mention --prompt");
    // Must explain that it's injected before the user task
    assert.ok(msg.toLowerCase().includes("before"), "Warning should explain prompt is injected before user task");
    // Must mention conflict with positional task
    assert.ok(msg.toLowerCase().includes("conflict"), "Warning should mention conflict with positional task");
    // Must recommend keeping prompt role-only
    assert.ok(msg.toLowerCase().includes("role-only") || msg.toLowerCase().includes("role only"),
      "Warning should recommend keeping prompt role-only");
  });

  it("does not flag templates that describe behavior without embedding a concrete task", () => {
    // This template describes HOW the agent should behave (role) but doesn't embed a fixed task.
    const template = [
      "# 产品规划助手",
      "",
      "你是一个专业的产品经理。",
      "",
      "用户会提供一个想法或需求描述，你需要：",
      "1. 确认理解是否正确",
      "2. 提出澄清问题",
      "3. 输出完整的规划文档",
      "",
      "请按以下结构输出：",
      "### 产品概述",
      "### 需求分析",
      "### 功能规格",
    ].join("\n");
    const issues = detectPromptTemplateIssues(template);
    assert.deepEqual(issues, [], `Role-only template should not be flagged, got: ${JSON.stringify(issues)}`);
  });
});
