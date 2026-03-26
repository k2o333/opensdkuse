// OpenCode SDK adapter layer
// Uses v2 API: @opencode-ai/sdk/v2
import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import { AppError } from "./errors.js";

// Lazy import types
type OpencodeClientType = import("@opencode-ai/sdk/v2").OpencodeClient;
type OutputFormat = import("@opencode-ai/sdk/v2").OutputFormat;

export interface RuntimeHandle {
  client: OpencodeClientType;
  server: { url: string; close(): void } | null;
  mode: "attach" | "spawn";
}

export interface SessionConfig {
  title: string;
  agent?: string;
  model?: string;
  permissions?: unknown;
}

export interface StructuredOutputOptions {
  schema: Record<string, unknown>;
  retryCount?: number;
}

// Dependency injection for SDK — allows mocking in tests
export interface SdkDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createOpencodeClient: (config?: any) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createOpencode: (options?: any) => Promise<{ client: any; server: { url: string; close(): void } }>;
}

function parseModel(model: string): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined;
  const parts = model.split("/");
  if (parts.length >= 2) {
    return { providerID: parts[0], modelID: parts.slice(1).join("/") };
  }
  return { providerID: model, modelID: model };
}

export async function connectOrStartServer(
  config: AppConfig,
  deps?: { logger?: Logger; signal?: AbortSignal; sdk?: SdkDeps },
): Promise<RuntimeHandle> {
  const logger = deps?.logger;

  // Load SDK deps (real or mocked)
  let sdk: SdkDeps;
  if (deps?.sdk) {
    sdk = deps.sdk;
  } else {
    const [{ createOpencodeClient }, { createOpencode }] = await Promise.all([
      import("@opencode-ai/sdk/v2/client"),
      import("@opencode-ai/sdk/v2"),
    ]);
    sdk = { createOpencodeClient, createOpencode };
  }

  // Try attach first
  const baseUrl = `http://${config.hostname}:${config.port}`;
  logger?.info(`Attempting to attach to OpenCode server at ${baseUrl}...`);

  try {
    const client = sdk.createOpencodeClient({ baseUrl });

    // Health check using v2 API
    const health = await client.global.health();
    if (health.data?.healthy) {
      logger?.info(`Attached to OpenCode server (version: ${health.data.version})`);
      return { client, server: null, mode: "attach" };
    }
    throw new AppError("HEALTHCHECK_FAILED", "Server reported unhealthy status");
  } catch (err: any) {
    if (err instanceof AppError && err.code === "HEALTHCHECK_FAILED") {
      logger?.info("Health check failed, will try spawn...");
    } else {
      logger?.info("Attach failed (server may not be running), will try spawn...");
    }
  }

  // Spawn mode
  logger?.info(`Spawning new OpenCode server on ${config.hostname}:${config.port}...`);

  try {
    const result = await sdk.createOpencode({
      hostname: config.hostname,
      port: config.port,
      timeout: config.startupTimeoutMs,
      signal: deps?.signal,
    });
    logger?.info(`OpenCode server spawned at ${result.server.url}`);
    return { client: result.client, server: result.server, mode: "spawn" };
  } catch (err: any) {
    throw new AppError("SPAWN_FAILED", `Failed to spawn OpenCode server: ${err?.message || err}`, err);
  }
}

export async function validateAgent(
  client: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  agentName: string,
  logger?: Logger,
): Promise<void> {
  try {
    const result = await client.app.agents();
    const agents: Array<{ name: string; mode: string }> = result?.data ?? [];
    const found = agents.find((a) => a.name === agentName);
    if (!found) {
      const available = agents.map((a) => a.name).join(", ");
      throw new AppError(
        "CONFIG_INVALID",
        `Agent "${agentName}" not found. Available agents: ${available || "(none)"}`,
      );
    }
    logger?.debug(`Agent "${agentName}" validated (mode: ${found.mode})`);
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    // agents() call failed — log and continue without validation
    logger?.debug(`Agent validation skipped (agents() failed): ${err?.message || err}`);
  }
}

export async function createSession(
  client: OpencodeClientType,
  sessionConfig: SessionConfig,
): Promise<{ id: string }> {
  const result = await client.session.create({
    title: sessionConfig.title,
  });
  if (!result.data?.id) {
    throw new AppError("SESSION_CREATE_FAILED", "Session creation returned no ID");
  }
  return { id: result.data.id };
}

export async function injectPromptTemplate(
  client: OpencodeClientType,
  sessionId: string,
  text: string,
): Promise<void> {
  await client.session.prompt({
    sessionID: sessionId,
    noReply: true,
    parts: [{ type: "text", text }],
  });
}

export async function executePrompt(
  client: OpencodeClientType,
  sessionId: string,
  task: string,
  opts?: { model?: string; structured?: StructuredOutputOptions },
): Promise<import("./response.js").SdkPromptResult> {
  const model = opts?.model ? parseModel(opts.model) : undefined;

  let format: OutputFormat | undefined;
  if (opts?.structured) {
    format = {
      type: "json_schema",
      schema: opts.structured.schema,
      retryCount: opts.structured.retryCount,
    };
  }

  const result = await client.session.prompt({
    sessionID: sessionId,
    model,
    format,
    parts: [{ type: "text", text: task }],
  });

  return {
    data: result.data ? {
      info: result.data.info as any,
      parts: result.data.parts as any,
    } : undefined,
    error: result.error as any,
  };
}

export async function abortSession(client: OpencodeClientType, sessionId: string): Promise<void> {
  try {
    await client.session.abort({ sessionID: sessionId });
  } catch (err: any) {
    throw new AppError("SESSION_ABORT_FAILED", `Failed to abort session: ${err?.message || err}`, err);
  }
}

export async function deleteSession(client: OpencodeClientType, sessionId: string): Promise<void> {
  try {
    await client.session.delete({ sessionID: sessionId });
  } catch (err: any) {
    throw new AppError("SESSION_DELETE_FAILED", `Failed to delete session: ${err?.message || err}`, err);
  }
}

export async function closeServer(server: RuntimeHandle["server"]): Promise<void> {
  if (!server) return;
  try {
    server.close();
  } catch {
    // swallow close errors
  }
}
