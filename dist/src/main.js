import { parseArgs, validateInput, showHelp } from "./cli.js";
import { createConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { loadPromptTemplate, buildUserTask } from "./prompt.js";
import { connectOrStartServer, validateAgent, createSession, injectPromptTemplate, executePrompt, abortSession, deleteSession, closeServer, } from "./opencode.js";
import { normalizeSdkResponse, formatTextOutput, formatJsonOutput, isStructuredOutputError, } from "./response.js";
import { AppError, getExitCode } from "./errors.js";
import { readFileSync } from "node:fs";
function loadSchemaFile(filePath) {
    let content;
    try {
        content = readFileSync(filePath, "utf-8");
    }
    catch {
        throw new AppError("CONFIG_INVALID", `Schema file not found: "${filePath}"`);
    }
    let schema;
    try {
        schema = JSON.parse(content);
    }
    catch {
        throw new AppError("CONFIG_INVALID", `Schema file "${filePath}" is not valid JSON`);
    }
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
        throw new AppError("CONFIG_INVALID", `Schema file "${filePath}" must be a JSON object`);
    }
    return schema;
}
export async function main(argv) {
    const rawArgs = argv ?? process.argv.slice(2);
    // Parse CLI args
    let cliArgs;
    try {
        cliArgs = parseArgs(rawArgs);
    }
    catch (err) {
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
    }
    catch (err) {
        if (err instanceof AppError) {
            logger.error(err.message);
            return getExitCode(err.code);
        }
        throw err;
    }
    // Load prompt template
    let promptTemplate;
    try {
        promptTemplate = loadPromptTemplate(config.promptFile);
    }
    catch (err) {
        if (err instanceof AppError) {
            logger.error(err.message);
            return getExitCode(err.code);
        }
        throw err;
    }
    // Setup abort controller for timeout and signals
    const abortController = new AbortController();
    let runtimeHandle = null;
    let sessionId = null;
    // Shared interrupt flag and error holder
    let interrupted = false;
    let mainError = null;
    // Timeout timer
    let timeoutTimer;
    if (config.startupTimeoutMs > 0) {
        timeoutTimer = setTimeout(() => {
            if (!interrupted) {
                interrupted = true;
                mainError = new AppError("TIMEOUT", `Execution timed out after ${config.startupTimeoutMs}ms`);
                abortController.abort();
            }
        }, config.startupTimeoutMs);
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
        if (interrupted)
            throw mainError;
        // Validate agent if specified (pre-check only, not passed to SDK)
        if (cliArgs.agent) {
            logger.debug(`Validating agent "${cliArgs.agent}" (pre-check only)...`);
            await validateAgent(runtimeHandle.client, cliArgs.agent, logger);
        }
        // Create session (only title is passed to SDK)
        const sessionResult = await createSession(runtimeHandle.client, config.sessionTitle);
        sessionId = sessionResult.id;
        logger.debug(`Session created: ${sessionId}`);
        if (interrupted)
            throw mainError;
        // Phase 1: Inject prompt template (noReply)
        logger.debug("Injecting prompt template...");
        await injectPromptTemplate(runtimeHandle.client, sessionId, promptTemplate);
        if (interrupted)
            throw mainError;
        // Phase 2: Execute user task
        const userTask = buildUserTask(cliArgs.userInput);
        logger.debug("Sending user task...");
        if (cliArgs.json && !cliArgs.schemaFile) {
            throw new AppError("CONFIG_INVALID", "--json requires --schema-file to specify a JSON schema");
        }
        const promptOpts = {};
        if (config.model)
            promptOpts.model = config.model;
        if (cliArgs.schemaFile) {
            const schema = loadSchemaFile(cliArgs.schemaFile);
            promptOpts.structured = { schema };
            if (cliArgs.debug) {
                logger.debug(`Structured output enabled with schema: ${cliArgs.schemaFile}`);
            }
        }
        const rawResult = await executePrompt(runtimeHandle.client, sessionId, userTask, promptOpts);
        if (interrupted)
            throw mainError;
        // Normalize and output
        const normalized = normalizeSdkResponse(rawResult);
        // Check for errors in response
        if (normalized.error) {
            if (isStructuredOutputError(normalized.error)) {
                mainError = new AppError("STRUCTURED_OUTPUT_FAILED", `Structured output failed after ${normalized.error.retries ?? "?"} retries: ${normalized.error.message}`);
                logger.error(mainError.message);
            }
            else {
                logger.error(`Model returned error: ${normalized.error.name}: ${normalized.error.message}`);
            }
        }
        // Output
        if (cliArgs.json) {
            if (cliArgs.debug) {
                logger.debug("Structured output mode enabled");
            }
            console.log(formatJsonOutput(normalized));
        }
        else {
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
    }
    catch (err) {
        if (err instanceof AppError) {
            mainError = err;
            logger.error(err.message);
            if (cliArgs.debug && err.cause) {
                logger.debug("Cause:", err.cause);
            }
        }
        else if (err instanceof Error) {
            mainError = new AppError("UNKNOWN", err.message, err);
            logger.error(err.message);
            if (cliArgs.debug) {
                logger.debug(err.stack);
            }
        }
        else {
            mainError = new AppError("UNKNOWN", String(err));
            logger.error(String(err));
        }
        return getExitCode(mainError.code);
    }
    finally {
        // Cleanup
        if (timeoutTimer)
            clearTimeout(timeoutTimer);
        process.off("SIGINT", handleSigint);
        process.off("SIGTERM", handleSigterm);
        if (runtimeHandle) {
            // Abort session if running
            if (sessionId) {
                try {
                    await abortSession(runtimeHandle.client, sessionId);
                    logger.debug("Session aborted");
                }
                catch (err) {
                    logger.debug("Session abort failed (may already be complete):", err);
                }
                // Delete session unless keep-session
                if (!cliArgs.keepSession) {
                    try {
                        await deleteSession(runtimeHandle.client, sessionId);
                        logger.debug("Session deleted");
                    }
                    catch (err) {
                        logger.debug("Session delete failed:", err);
                    }
                }
            }
            // Close server if spawned
            if (runtimeHandle.mode === "spawn") {
                try {
                    await closeServer(runtimeHandle.server);
                    logger.debug("Server closed");
                }
                catch (err) {
                    logger.debug("Server close failed:", err);
                }
            }
        }
    }
}
