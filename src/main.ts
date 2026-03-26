import { parseArgs, validateInput, showHelp } from "./cli.js";
import { createConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { loadPromptTemplate, buildUserTask } from "./prompt.js";
import {
  connectOrStartServer,
  validateAgent,
  createSession,
  injectPromptTemplate,
  executePrompt,
  abortSession,
  deleteSession,
  closeServer,
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

  const config = createConfig(cliArgs);
  const logger = createLogger(cliArgs.debug);

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

  // Setup abort controller for timeout and signals
  const abortController = new AbortController();
  let runtimeHandle: RuntimeHandle | null = null;
  let sessionId: string | null = null;
  let interrupted = false;
  let mainError: AppError | null = null;

  // Timeout timer
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  if (config.startupTimeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      if (!interrupted) {
        interrupted = true;
        mainError = new AppError("TIMEOUT", `Execution timed out after ${config.startupTimeoutMs}ms`);
        abortController.abort();
      }
    }, config.startupTimeoutMs);
  }

  // Signal handlers
  const onSignal = (signal: string) => {
    if (!interrupted) {
      interrupted = true;
      mainError = new AppError("INTERRUPTED", `Received ${signal}`);
      abortController.abort();
    }
  };

  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  try {
    // Connect or spawn
    runtimeHandle = await connectOrStartServer(config, {
      logger,
      signal: abortController.signal,
    });

    if (interrupted) throw mainError!;

    // Validate agent if specified
    if (cliArgs.agent) {
      logger.debug(`Validating agent "${cliArgs.agent}"...`);
      await validateAgent(runtimeHandle.client, cliArgs.agent, logger);
    }

    // Create session
    const sessionResult = await createSession(runtimeHandle.client, {
      title: config.sessionTitle,
      agent: cliArgs.agent,
      model: config.model || undefined,
    });
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
    process.off("SIGINT", () => onSignal("SIGINT"));
    process.off("SIGTERM", () => onSignal("SIGTERM"));

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
