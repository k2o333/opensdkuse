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

export function normalizeSdkResponse(result: SdkPromptResult): NormalizedResponse {
  const raw = result;
  const data = result?.data;

  const info: AssistantInfo | null = data?.info ?? null;
  const parts: Part[] = (data?.parts as Part[]) ?? [];

  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const text = textParts.length > 0 ? textParts.map((p) => p.text).join("\n") : null;

  const otherParts = parts.filter((p): p is NonTextPart => p.type !== "text");

  const structuredOutput = info?.structured ?? null;

  let error: { name?: string; message?: string; retries?: number } | null = null;
  if (info?.error) {
    error = {
      name: info.error.name,
      message: info.error.data?.message,
      retries: info.error.data?.retries,
    };
  }

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
  const output: Record<string, unknown> = {};
  if (normalized.structuredOutput !== null) {
    output.structured = normalized.structuredOutput;
  }
  if (normalized.text) {
    output.text = normalized.text;
  }
  if (normalized.error) {
    output.error = normalized.error;
  }
  return JSON.stringify(output, null, 2);
}
