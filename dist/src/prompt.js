import { readFileSync } from "node:fs";
import { AppError } from "./errors.js";
export function loadPromptTemplate(filePath) {
    let content;
    try {
        content = readFileSync(filePath, "utf-8");
    }
    catch (err) {
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
export function validatePromptTemplate(content, maxLength) {
    if (content.length === 0) {
        throw new AppError("PROMPT_FILE_EMPTY", "Prompt file is empty");
    }
    if (content.trim().length === 0) {
        throw new AppError("PROMPT_FILE_WHITESPACE_ONLY", "Prompt file contains only whitespace");
    }
    if (content.length > maxLength) {
        throw new AppError("PROMPT_FILE_TOO_LONG", `Prompt file exceeds maximum length of ${maxLength} characters (got ${content.length})`);
    }
}
export function buildUserTask(input) {
    return input.trim();
}
