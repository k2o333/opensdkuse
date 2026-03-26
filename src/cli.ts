import { AppError } from "./errors.js";

export interface CliArgs {
  showHelp: boolean;
  debug: boolean;
  info: boolean;
  keepSession: boolean;
  json: boolean;
  schemaFile?: string;
  model?: string;
  host?: string;
  port?: number;
  promptFile?: string;
  timeoutMs?: number;
  agent?: string;
  userInput: string;
}

const VALID_FLAGS = new Set([
  "--help",
  "-h",
  "--debug",
  "--info",
  "--keep-session",
  "--json",
]);

const VALUE_FLAGS = new Set([
  "--model",
  "--host",
  "--port",
  "--prompt",
  "--timeout",
  "--agent",
  "--schema-file",
]);

function parsePositiveInt(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError("CONFIG_INVALID", `Invalid ${label}: "${value}" must be a positive integer`);
  }
  return n;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    showHelp: false,
    debug: false,
    info: false,
    keepSession: false,
    json: false,
    userInput: "",
  };

  let i = 0;
  const positionalParts: string[] = [];

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === "--") {
      positionalParts.push(...argv.slice(i + 1));
      break;
    }

    if (arg === "--help" || arg === "-h") {
      args.showHelp = true;
      i++;
      continue;
    }

    if (arg === "--debug") {
      args.debug = true;
      i++;
      continue;
    }

    if (arg === "--info") {
      args.info = true;
      i++;
      continue;
    }

    if (arg === "--keep-session") {
      args.keepSession = true;
      i++;
      continue;
    }

    if (arg === "--json") {
      args.json = true;
      i++;
      continue;
    }

    if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= argv.length) {
        throw new AppError("CONFIG_INVALID", `Missing value for ${arg}`);
      }
      const value = argv[i + 1];
      switch (arg) {
        case "--model":
          args.model = value;
          break;
        case "--host":
          args.host = value;
          break;
        case "--port":
          args.port = parsePositiveInt(value, "--port");
          break;
        case "--prompt":
          args.promptFile = value;
          break;
        case "--timeout":
          args.timeoutMs = parsePositiveInt(value, "--timeout");
          break;
        case "--agent":
          args.agent = value;
          break;
        case "--schema-file":
          args.schemaFile = value;
          break;
      }
      i += 2;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new AppError("CONFIG_INVALID", `Unknown argument: "${arg}"`);
    }

    positionalParts.push(arg);
    i++;
  }

  args.userInput = positionalParts.join(" ").trim();

  return args;
}

export function validateInput(input: string, maxLength: number): void {
  if (!input || input.trim().length === 0) {
    throw new AppError("INPUT_INVALID", "User input cannot be empty. Provide a task as a positional argument.");
  }
  if (input.length > maxLength) {
    throw new AppError("INPUT_INVALID", `Input exceeds maximum length of ${maxLength} characters`);
  }
}

export function showHelp(): string {
  return `
OpenCode SDK CLI - Execute tasks via OpenCode AI

USAGE:
  npx ts-node run.ts [OPTIONS] <user task>

OPTIONS:
  --help, -h           Show this help message
  --debug              Enable debug output
  --model <name>       Model to use (e.g. provider/model-id)
  --host <hostname>    OpenCode server hostname (default: 127.0.0.1)
  --port <port>        OpenCode server port (default: 4096)
  --prompt <file>      Prompt template file (default: prompt.md)
  --keep-session       Keep session after execution
  --json                Output structured JSON result (requires --schema-file)
  --schema-file <path>  JSON Schema file for structured output
  --agent <name>      Validate agent exists (pre-check only, not passed to SDK)
  --timeout <ms>       Execution timeout in milliseconds (covers the entire workflow)
  --                   End of options (remaining args are task input)

ENVIRONMENT VARIABLES:
  OPENCODE_MODEL          Override default model
  OPENCODE_HOST           Override default host
  OPENCODE_PORT           Override default port
  OPENCODE_PROMPT         Override default prompt file path
  OPENCODE_TIMEOUT_MS     Override default timeout
  OPENCODE_MAX_INPUT_LENGTH  Override max input length

CONFIG PRIORITY: CLI args > Environment variables > Defaults

EXAMPLES:
  npx ts-node run.ts "Analyze this TypeScript code for null pointer risks"
  npx ts-node run.ts --debug --model opencode/big-pickle "Check for resource leaks"
  npx ts-node run.ts --json --schema-file schemas/basic.json "Extract structured fields"
  npx ts-node run.ts --keep-session "Start a debugging session"
`.trim();
}
