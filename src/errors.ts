export type AppErrorCode =
  | "INPUT_INVALID"
  | "PROMPT_FILE_NOT_FOUND"
  | "PROMPT_FILE_EMPTY"
  | "PROMPT_FILE_WHITESPACE_ONLY"
  | "PROMPT_FILE_DECODE_FAILED"
  | "PROMPT_FILE_TOO_LONG"
  | "CONFIG_INVALID"
  | "ATTACH_FAILED"
  | "HEALTHCHECK_FAILED"
  | "SPAWN_FAILED"
  | "SESSION_CREATE_FAILED"
  | "SESSION_PROMPT_FAILED"
  | "SESSION_ABORT_FAILED"
  | "SESSION_DELETE_FAILED"
  | "STRUCTURED_OUTPUT_FAILED"
  | "TIMEOUT"
  | "INTERRUPTED"
  | "UNKNOWN";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getExitCode(code: AppErrorCode): number {
  switch (code) {
    case "INPUT_INVALID":
    case "CONFIG_INVALID":
    case "PROMPT_FILE_NOT_FOUND":
    case "PROMPT_FILE_EMPTY":
    case "PROMPT_FILE_WHITESPACE_ONLY":
    case "PROMPT_FILE_DECODE_FAILED":
    case "PROMPT_FILE_TOO_LONG":
      return 2;
    case "TIMEOUT":
      return 3;
    case "INTERRUPTED":
      return 130;
    case "ATTACH_FAILED":
    case "HEALTHCHECK_FAILED":
    case "SPAWN_FAILED":
    case "SESSION_CREATE_FAILED":
    case "SESSION_PROMPT_FAILED":
    case "SESSION_ABORT_FAILED":
    case "SESSION_DELETE_FAILED":
    case "STRUCTURED_OUTPUT_FAILED":
      return 1;
    default:
      return 1;
  }
}
