import { AppError } from "./errors.js";
function parseModel(model) {
    if (!model)
        return undefined;
    const parts = model.split("/");
    if (parts.length >= 2) {
        return { providerID: parts[0], modelID: parts.slice(1).join("/") };
    }
    return { providerID: model, modelID: model };
}
export async function connectOrStartServer(config, deps) {
    const logger = deps?.logger;
    // Load SDK deps (real or mocked)
    let sdk;
    if (deps?.sdk) {
        sdk = deps.sdk;
    }
    else {
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
    }
    catch (err) {
        if (err instanceof AppError && err.code === "HEALTHCHECK_FAILED") {
            logger?.info("Health check failed, will try spawn...");
        }
        else {
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
    }
    catch (err) {
        throw new AppError("SPAWN_FAILED", `Failed to spawn OpenCode server: ${err?.message || err}`, err);
    }
}
export async function validateAgent(client, // eslint-disable-line @typescript-eslint/no-explicit-any
agentName, logger) {
    try {
        const result = await client.app.agents();
        const agents = result?.data ?? [];
        const found = agents.find((a) => a.name === agentName);
        if (!found) {
            const available = agents.map((a) => a.name).join(", ");
            throw new AppError("CONFIG_INVALID", `Agent "${agentName}" not found. Available agents: ${available || "(none)"}`);
        }
        logger?.debug(`Agent "${agentName}" validated (mode: ${found.mode})`);
    }
    catch (err) {
        if (err instanceof AppError)
            throw err;
        logger?.debug(`Agent validation skipped (agents() failed): ${err?.message || err}`);
    }
}
export async function createSession(client, title) {
    const result = await client.session.create({ title });
    if (!result.data?.id) {
        throw new AppError("SESSION_CREATE_FAILED", "Session creation returned no ID");
    }
    return { id: result.data.id };
}
export async function injectPromptTemplate(client, sessionId, text) {
    await client.session.prompt({
        sessionID: sessionId,
        noReply: true,
        parts: [{ type: "text", text }],
    });
}
export async function executePrompt(client, sessionId, task, opts) {
    const model = opts?.model ? parseModel(opts.model) : undefined;
    let format;
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
            info: result.data.info,
            parts: result.data.parts,
        } : undefined,
        error: result.error,
    };
}
export async function abortSession(client, sessionId) {
    try {
        await client.session.abort({ sessionID: sessionId });
    }
    catch (err) {
        throw new AppError("SESSION_ABORT_FAILED", `Failed to abort session: ${err?.message || err}`, err);
    }
}
export async function deleteSession(client, sessionId) {
    try {
        await client.session.delete({ sessionID: sessionId });
    }
    catch (err) {
        throw new AppError("SESSION_DELETE_FAILED", `Failed to delete session: ${err?.message || err}`, err);
    }
}
export async function closeServer(server) {
    if (!server)
        return;
    try {
        server.close();
    }
    catch {
        // swallow close errors
    }
}
