import type { CliArgs } from "./cli.js";

export interface AppConfig {
  model: string;
  hostname: string;
  port: number;
  promptFile: string;
  sessionTitle: string;
  startupTimeoutMs: number;
  maxInputLength: number;
}

const DEFAULTS: AppConfig = {
  model: "",
  hostname: "127.0.0.1",
  port: 4096,
  promptFile: "prompt.md",
  sessionTitle: "opencode-cli-session",
  startupTimeoutMs: 30000,
  maxInputLength: 100000,
};

function envOr(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function envInt(key: string): number | undefined {
  const v = envOr(key);
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export function createConfig(cliArgs?: Partial<CliArgs>): AppConfig {
  const config: AppConfig = { ...DEFAULTS };

  // Environment variables override defaults
  const envModel = envOr("OPENCODE_MODEL");
  if (envModel) config.model = envModel;

  const envHost = envOr("OPENCODE_HOST");
  if (envHost) config.hostname = envHost;

  const envPort = envInt("OPENCODE_PORT");
  if (envPort !== undefined) config.port = envPort;

  const envPrompt = envOr("OPENCODE_PROMPT");
  if (envPrompt) config.promptFile = envPrompt;

  const envTimeout = envInt("OPENCODE_TIMEOUT_MS");
  if (envTimeout !== undefined) config.startupTimeoutMs = envTimeout;

  const envMaxLen = envInt("OPENCODE_MAX_INPUT_LENGTH");
  if (envMaxLen !== undefined) config.maxInputLength = envMaxLen;

  // CLI args override env + defaults
  if (cliArgs?.model) config.model = cliArgs.model;
  if (cliArgs?.host) config.hostname = cliArgs.host;
  if (cliArgs?.port !== undefined) config.port = cliArgs.port;
  if (cliArgs?.promptFile) config.promptFile = cliArgs.promptFile;
  if (cliArgs?.timeoutMs !== undefined) config.startupTimeoutMs = cliArgs.timeoutMs;

  return config;
}

export function getServerUrl(config: AppConfig): string {
  return `http://${config.hostname}:${config.port}`;
}
