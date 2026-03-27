import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface DateLogFileStats {
  file: string;
  llmCalls: number;
}

export interface DateLogStats {
  date: string;
  files: DateLogFileStats[];
  totalLlmCalls: number;
}

export interface SessionLogStats {
  sessionId: string;
  logFiles: string[];
  messageRequests: number;
  llmCalls: number;
  providers: string[];
  models: string[];
  errors: string[];
}

function getLogFiles(logDir: string): string[] {
  return readdirSync(logDir)
    .filter((name) => name.endsWith(".log"))
    .sort();
}

function readLogFile(logDir: string, file: string): string {
  return readFileSync(join(logDir, file), "utf8");
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

function extractMatch(line: string, pattern: RegExp): string | null {
  const match = line.match(pattern);
  return match?.[1] ?? null;
}

function isMessageRequestLine(line: string, sessionId: string): boolean {
  return (
    line.includes(`path=/session/${sessionId}/message request`) &&
    line.includes("service=server") &&
    !line.includes("status=")
  );
}

function isLlmStartLine(line: string, sessionId?: string): boolean {
  if (!line.includes("service=llm ")) return false;
  if (sessionId && !line.includes(`sessionID=${sessionId}`)) return false;
  return line.includes(" stream") && !line.includes(" error=");
}

function isLlmErrorLine(line: string, sessionId: string): boolean {
  return line.includes("service=llm ") && line.includes(`sessionID=${sessionId}`) && line.includes(" error=");
}

export function summarizeDateLogs(logDir: string, date: string): DateLogStats {
  const files = getLogFiles(logDir)
    .filter((file) => file.startsWith(date))
    .map((file) => {
      const content = readLogFile(logDir, file);
      return {
        file,
        llmCalls: countMatches(content, /service=llm .* stream(?! error)/g),
      };
    })
    .filter((entry) => entry.llmCalls > 0);

  const totalLlmCalls = files.reduce((sum, file) => sum + file.llmCalls, 0);

  return { date, files, totalLlmCalls };
}

export function summarizeSessionLogs(logDir: string, sessionId: string): SessionLogStats {
  const logFiles: string[] = [];
  let messageRequests = 0;
  let llmCalls = 0;
  const providers: string[] = [];
  const models: string[] = [];
  const errors: string[] = [];

  for (const file of getLogFiles(logDir)) {
    const content = readLogFile(logDir, file);
    if (!content.includes(sessionId)) continue;

    logFiles.push(file);

    for (const line of content.split("\n")) {
      if (!line.includes(sessionId)) continue;

      if (isMessageRequestLine(line, sessionId)) {
        messageRequests++;
      }

      if (isLlmStartLine(line, sessionId)) {
        llmCalls++;
        const provider = extractMatch(line, /providerID=([^\s]+)/);
        const model = extractMatch(line, /modelID=([^\s]+)/);
        if (provider) providers.push(provider);
        if (model) models.push(model);
      }

      if (isLlmErrorLine(line, sessionId)) {
        errors.push(line.trim());
      }
    }
  }

  return {
    sessionId,
    logFiles,
    messageRequests,
    llmCalls,
    providers: uniqueSorted(providers),
    models: uniqueSorted(models),
    errors,
  };
}

function showUsage(): string {
  return [
    "Usage:",
    "  node --loader ts-node/esm src/opencode-log-stats.ts --date YYYY-MM-DD [--log-dir PATH]",
    "  node --loader ts-node/esm src/opencode-log-stats.ts --session-id SESSION_ID [--log-dir PATH]",
  ].join("\n");
}

function parseCliArgs(argv: string[]): { date?: string; sessionId?: string; logDir: string } {
  let date: string | undefined;
  let sessionId: string | undefined;
  let logDir = "/root/.local/share/opencode/log";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];

    switch (arg) {
      case "--date":
        date = value;
        i++;
        break;
      case "--session-id":
        sessionId = value;
        i++;
        break;
      case "--log-dir":
        logDir = value;
        i++;
        break;
      case "--help":
      case "-h":
        console.log(showUsage());
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if ((!date && !sessionId) || (date && sessionId)) {
    throw new Error("Specify exactly one of --date or --session-id");
  }

  if (!logDir) {
    throw new Error("Missing value for --log-dir");
  }

  return { date, sessionId, logDir };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseCliArgs(argv);

    if (args.date) {
      console.log(JSON.stringify(summarizeDateLogs(args.logDir, args.date), null, 2));
      return 0;
    }

    console.log(JSON.stringify(summarizeSessionLogs(args.logDir, args.sessionId!), null, 2));
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    console.error(showUsage());
    return 1;
  }
}

const isEntrypoint = process.argv[1] != null && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
