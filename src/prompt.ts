import { readFileSync } from "node:fs";
import { AppError } from "./errors.js";

export function loadPromptTemplate(filePath: string): string {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new AppError("PROMPT_FILE_NOT_FOUND", `Prompt file not found: "${filePath}"`, err);
    }
    if (err?.code === "EACCES") {
      throw new AppError("PROMPT_FILE_DECODE_FAILED", `Permission denied reading prompt file: "${filePath}"`, err);
    }
    throw new AppError("PROMPT_FILE_DECODE_FAILED", `Failed to read prompt file: "${filePath}"`, err);
  }
  validatePromptTemplate(content, 50000);
  return content;
}

export function validatePromptTemplate(content: string, maxLength: number): void {
  if (content.length === 0) {
    throw new AppError("PROMPT_FILE_EMPTY", "Prompt file is empty");
  }
  if (content.trim().length === 0) {
    throw new AppError("PROMPT_FILE_WHITESPACE_ONLY", "Prompt file contains only whitespace");
  }
  if (content.length > maxLength) {
    throw new AppError(
      "PROMPT_FILE_TOO_LONG",
      `Prompt file exceeds maximum length of ${maxLength} characters (got ${content.length})`,
    );
  }
}

export function detectPromptTemplateIssues(content: string): string[] {
  const normalized = content.toLowerCase();
  const issues: string[] = [];

  const hasConcreteOutputRequest =
    normalized.includes("写一个文档给我") ||
    normalized.includes("write a document for me") ||
    normalized.includes("output to ") ||
    normalized.includes("写到 ") ||
    normalized.includes("请在 ");
  const hasRepoSpecificTask =
    normalized.includes("根据这个代码库") ||
    normalized.includes("according to this codebase") ||
    normalized.includes("如果我要让这个代码库") ||
    normalized.includes("in /home/quan/proj/opensdkuse/docs");

  if (hasConcreteOutputRequest || hasRepoSpecificTask) {
    issues.push(
      "Prompt template appears to include a fixed user task. Templates passed via --prompt should define role/rules only, not embed a concrete one-off request.",
    );
  }

  return issues;
}

export function buildUserTask(input: string): string {
  return input.trim();
}
