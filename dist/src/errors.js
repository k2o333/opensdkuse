export class AppError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = "AppError";
    }
}
export function getExitCode(code) {
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
