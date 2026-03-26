import type { AppError } from "./errors.js";

// Part types from v2 SDK
interface TextPart {
  type: "text";
  text: string;
  [key: string]: unknown;
}

interface NonTextPart {
  type: string;
  [key: string]: unknown;
}

type Part = TextPart | NonTextPart;

interface AssistantInfo {
  id: string;
  sessionID: string;
  role: string;
  error?: {
    name: string;
    message?: string;
    data?: { message?: string; retries?: number; [key: string]: unknown };
  };
  structured?: unknown;
  [key: string]: unknown;
}

export interface SdkPromptResult {
  data?: {
    info?: AssistantInfo;
    parts?: Part[];
  };
  error?: unknown;
}

export interface NormalizedResponse {
  raw: unknown;
  info: AssistantInfo | null;
  parts: Part[];
  text: string | null;
  otherParts: NonTextPart[];
  structuredOutput: unknown | null;
  error: { name?: string; message?: string; retries?: number } | null;
}

function getRootData(result: SdkPromptResult): { info: AssistantInfo | null; parts: Part[] } {
  const data = result?.data;
  return {
    info: data?.info ?? null,
    parts: (data?.parts as Part[]) ?? [],
  };
}

function getInfo(result: SdkPromptResult): AssistantInfo | null {
  return result?.data?.info ?? null;
}

function getParts(result: SdkPromptResult): Part[] {
  return (result?.data?.parts as Part[]) ?? [];
}

function extractTextFromParts(parts: Part[]): string | null {
  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  if (textParts.length === 0) return null;
  return textParts.map((p) => p.text).join("\n");
}

function extractStructuredOutputFromInfo(info: AssistantInfo | null): unknown | null {
  return info?.structured ?? null;
}

function extractErrorFromInfo(info: AssistantInfo | null): { name?: string; message?: string; retries?: number } | null {
  if (!info?.error) return null;
  return {
    name: info.error.name,
    message: info.error.data?.message ?? info.error.message,
    retries: info.error.data?.retries,
  };
}

export function normalizeSdkResponse(result: SdkPromptResult): NormalizedResponse {
  const raw = result;
  const { info, parts } = getRootData(result);

  const text = extractTextFromParts(parts);
  const otherParts = parts.filter((p): p is NonTextPart => p.type !== "text");
  const structuredOutput = extractStructuredOutputFromInfo(info);
  const error = extractErrorFromInfo(info);

  return { raw, info, parts, text, otherParts, structuredOutput, error };
}

export function extractText(normalized: NormalizedResponse): string | null {
  return normalized.text;
}

export function extractStructuredOutput(normalized: NormalizedResponse): unknown | null {
  return normalized.structuredOutput;
}

export function isStructuredOutputError(error: { name?: string } | null): boolean {
  return error?.name === "StructuredOutputError";
}

export function formatTextOutput(normalized: NormalizedResponse): string {
  if (normalized.text) {
    return normalized.text;
  }
  if (normalized.structuredOutput !== null) {
    return JSON.stringify(normalized.structuredOutput, null, 2);
  }
  return "[No text content returned from model]";
}

export function formatJsonOutput(normalized: NormalizedResponse): string {
  let mode: "structured" | "text" | "error";
  if (normalized.error) {
    mode = "error";
  } else if (normalized.structuredOutput !== null) {
    mode = "structured";
  } else {
    mode = "text";
  }

  const output = {
    mode,
    sessionId: normalized.info?.sessionID ?? null,
    result: mode === "structured" ? normalized.structuredOutput : null,
    text: mode === "text" ? (normalized.text ?? null) : null,
    error: normalized.error
      ? { name: normalized.error.name, message: normalized.error.message, retries: normalized.error.retries }
      : null,
  };

  return JSON.stringify(output, null, 2);
}
