import { parseArgs, validateInput, showHelp } from "./cli.js";
import { createConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { loadPromptTemplate, buildUserTask, detectPromptTemplateIssues } from "./prompt.js";
import {
  connectOrStartServer,
  validateAgent,
  createSession,
  injectPromptTemplate,
  executePrompt,
  abortSession,
  deleteSession,
  closeServer,
  describeModelSelection,
  type RuntimeHandle,
  type StructuredOutputOptions,
} from "./opencode.js";
import {
  normalizeSdkResponse,
  formatTextOutput,
  formatJsonOutput,
  isStructuredOutputError,
} from "./response.js";
import { AppError, getExitCode } from "./errors.js";
import { readFileSync } from "node:fs";

function loadSchemaFile(filePath: string): Record<string, unknown> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    throw new AppError("CONFIG_INVALID", `Schema file not found: "${filePath}"`);
  }

  let schema: unknown;
  try {
    schema = JSON.parse(content);
  } catch {
    throw new AppError("CONFIG_INVALID", `Schema file "${filePath}" is not valid JSON`);
  }

  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new AppError("CONFIG_INVALID", `Schema file "${filePath}" must be a JSON object`);
  }

  return schema as Record<string, unknown>;
}

export async function main(argv?: string[]): Promise<number> {
  const rawArgs = argv ?? process.argv.slice(2);

  // Parse CLI args
  let cliArgs;
  try {
    cliArgs = parseArgs(rawArgs);
  } catch (err) {
    if (err instanceof AppError) {
      console.error(`Error: ${err.message}`);
      return getExitCode(err.code);
    }
    throw err;
  }

  if (cliArgs.showHelp) {
    console.log(showHelp());
    return 0;
  }

  if (cliArgs.json && !cliArgs.schemaFile) {
    console.error("Error: --json requires --schema-file to specify a JSON schema");
    return getExitCode("CONFIG_INVALID");
  }

  let structuredSchema: Record<string, unknown> | undefined;
  if (cliArgs.schemaFile) {
    try {
      structuredSchema = loadSchemaFile(cliArgs.schemaFile);
    } catch (err) {
      if (err instanceof AppError) {
        console.error(`Error: ${err.message}`);
        return getExitCode(err.code);
      }
      throw err;
    }
  }

  const config = createConfig(cliArgs);
  const logger = createLogger(cliArgs.debug, cliArgs.info);

  // Validate input
  try {
    validateInput(cliArgs.userInput, config.maxInputLength);
  } catch (err) {
    if (err instanceof AppError) {
      logger.error(err.message);
      return getExitCode(err.code);
    }
    throw err;
  }

  // Load prompt template
  let promptTemplate: string;
  try {
    promptTemplate = loadPromptTemplate(config.promptFile);
  } catch (err) {
    if (err instanceof AppError) {
      logger.error(err.message);
      return getExitCode(err.code);
    }
    throw err;
  }

  const promptTemplateIssues = detectPromptTemplateIssues(promptTemplate);
  for (const issue of promptTemplateIssues) {
    logger.info(`WARNING: ${issue}`);
  }

  // Setup abort controller for timeout and signals
  const abortController = new AbortController();
  let runtimeHandle: RuntimeHandle | null = null;
  let sessionId: string | null = null;

  // Shared interrupt flag and error holder
  let interrupted = false;
  let mainError: AppError | null = null;

  // Timeout timer
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const execTimeout = config.executionTimeoutMs ?? 0;
  if (execTimeout > 0) {
    timeoutTimer = setTimeout(() => {
      if (!interrupted) {
        interrupted = true;
        mainError = new AppError("TIMEOUT", `Execution timed out after ${execTimeout}ms`);
        abortController.abort();
      }
    }, execTimeout);
  }

  // Signal handlers - must be named functions to allow proper removal
  const handleSigint = () => {
    if (!interrupted) {
      interrupted = true;
      mainError = new AppError("INTERRUPTED", "Received SIGINT");
      abortController.abort();
    }
  };
  const handleSigterm = () => {
    if (!interrupted) {
      interrupted = true;
      mainError = new AppError("INTERRUPTED", "Received SIGTERM");
      abortController.abort();
    }
  };

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  try {
    // Connect or spawn
    runtimeHandle = await connectOrStartServer(config, {
      logger,
      signal: abortController.signal,
    });

    if (interrupted) throw mainError!;

    // Validate agent if specified (pre-check only, not passed to SDK)
    if (cliArgs.agent) {
      logger.debug(`Validating agent "${cliArgs.agent}" (pre-check only)...`);
      await validateAgent(runtimeHandle.client, cliArgs.agent, logger);
    }

    // Create session (only title is passed to SDK)
    const sessionResult = await createSession(runtimeHandle.client, config.sessionTitle);
    sessionId = sessionResult.id;
    logger.debug(`Session created: ${sessionId}`);

    if (interrupted) throw mainError!;

    // Phase 1: Inject prompt template (noReply)
    logger.debug("Injecting prompt template...");
    await injectPromptTemplate(runtimeHandle.client, sessionId, promptTemplate);

    if (interrupted) throw mainError!;

    // Phase 2: Execute user task
    const userTask = buildUserTask(cliArgs.userInput);
    logger.debug("Sending user task...");

    const promptOpts: { model?: string; structured?: StructuredOutputOptions } = {};
    if (config.model) promptOpts.model = config.model;
    if (cliArgs.debug) {
      logger.debug(`Using model: ${describeModelSelection(config.model)}`);
    }

    if (structuredSchema) {
      promptOpts.structured = { schema: structuredSchema };
      if (cliArgs.debug) {
        logger.debug(`Structured output enabled with schema: ${cliArgs.schemaFile}`);
      }
    }

    const rawResult = await executePrompt(runtimeHandle.client, sessionId, userTask, promptOpts);

    if (interrupted) throw mainError!;

    // Normalize and output
    const normalized = normalizeSdkResponse(rawResult);

    // Check for errors in response
    if (normalized.error) {
      if (isStructuredOutputError(normalized.error)) {
        mainError = new AppError(
          "STRUCTURED_OUTPUT_FAILED",
          `Structured output failed after ${normalized.error.retries ?? "?"} retries: ${normalized.error.message}`,
        );
        logger.error(mainError.message);
      } else {
        logger.error(`Model returned error: ${normalized.error.name}: ${normalized.error.message}`);
      }
    }

    // Output
    if (cliArgs.json) {
      if (cliArgs.debug) {
        logger.debug("Structured output mode enabled");
      }
      console.log(formatJsonOutput(normalized));
    } else {
      console.log(formatTextOutput(normalized));
    }

    if (cliArgs.debug) {
      logger.debug("Response parts count:", normalized.parts.length);
      logger.debug("Other parts:", normalized.otherParts.map((p) => p.type).join(", "));
    }

    // keep-session output
    if (cliArgs.keepSession && sessionId) {
      logger.info(`Session kept: ${sessionId}`);
    }

    if (mainError) {
      return getExitCode(mainError.code);
    }
    return 0;
  } catch (err) {
    if (err instanceof AppError) {
      mainError = err;
      logger.error(err.message);
      if (cliArgs.debug && err.cause) {
        logger.debug("Cause:", err.cause);
      }
    } else if (err instanceof Error) {
      mainError = new AppError("UNKNOWN", err.message, err);
      logger.error(err.message);
      if (cliArgs.debug) {
        logger.debug(err.stack);
      }
    } else {
      mainError = new AppError("UNKNOWN", String(err));
      logger.error(String(err));
    }
    return getExitCode(mainError.code);
  } finally {
    // Cleanup
    if (timeoutTimer) clearTimeout(timeoutTimer);
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);

    if (runtimeHandle) {
      // Abort session if running
      if (sessionId) {
        try {
          await abortSession(runtimeHandle.client, sessionId);
          logger.debug("Session aborted");
        } catch (err) {
          logger.debug("Session abort failed (may already be complete):", err);
        }

        // Delete session unless keep-session
        if (!cliArgs.keepSession) {
          try {
            await deleteSession(runtimeHandle.client, sessionId);
            logger.debug("Session deleted");
          } catch (err) {
            logger.debug("Session delete failed:", err);
          }
        }
      }

      // Close server if spawned
      if (runtimeHandle.mode === "spawn") {
        try {
          await closeServer(runtimeHandle.server);
          logger.debug("Server closed");
        } catch (err) {
          logger.debug("Server close failed:", err);
        }
      }
    }
  }
}
