import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  type SdkDeps,
} from "../src/opencode.js";
import { AppError } from "../src/errors.js";
import type { AppConfig } from "../src/config.js";

// Mock uses `as any` to avoid requiring the full OpencodeClient shape in tests.
// This is intentional — we only mock the methods exercised by each test.

const MOCK_CONFIG: AppConfig = {
  model: "",
  hostname: "127.0.0.1",
  port: 4096,
  promptFile: "prompt.md",
  sessionTitle: "test-session",
  serverStartupTimeoutMs: 5000,
  executionTimeoutMs: 10000,
  maxInputLength: 100000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMockClient(overrides: Record<string, any> = {}): any {
  return {
    global: {
      health: async () => ({ data: { healthy: true, version: "1.0.0" } }),
    },
    session: {
      create: async (_params: any) => ({ data: { id: "sess-123" } }),
      prompt: async (_params: any) => ({
        data: {
          info: { id: "msg-1", sessionID: "sess-123", role: "assistant" },
          parts: [{ type: "text", text: "mock response" }],
        },
      }),
      abort: async (_params: any) => ({ data: {} }),
      delete: async (_params: any) => ({ data: {} }),
    },
    ...overrides,
  };
}

function makeMockSdkDeps(client: any): SdkDeps {
  return {
    createOpencodeClient: () => client,
    createOpencode: async () => ({
      client,
      server: { url: "http://127.0.0.1:4096", close: () => {} },
    }),
  };
}

describe("opencode.connectOrStartServer - attach success", () => {
  it("returns attach mode when health check passes", async () => {
    const client = makeMockClient();
    const sdk = makeMockSdkDeps(client);
    const handle = await connectOrStartServer(MOCK_CONFIG, { sdk });
    assert.equal(handle.mode, "attach");
    assert.equal(handle.server, null);
  });
});

describe("opencode.connectOrStartServer - attach fail then spawn", () => {
  it("falls back to spawn when health check fails", async () => {
    const client = makeMockClient({
      global: {
        health: async () => {
          throw new Error("connection refused");
        },
      },
    });
    let spawnCalled = false;
    const sdk: SdkDeps = {
      createOpencodeClient: () => client,
      createOpencode: async () => {
        spawnCalled = true;
        return {
          client,
          server: { url: "http://127.0.0.1:4096", close: () => {} },
        };
      },
    };
    const handle = await connectOrStartServer(MOCK_CONFIG, { sdk });
    assert.equal(handle.mode, "spawn");
    assert.ok(spawnCalled);
    assert.ok(handle.server);
  });

  it("falls back to spawn when server reports unhealthy", async () => {
    const client = makeMockClient({
      global: {
        health: async () => ({ data: { healthy: false, version: "1.0.0" } }),
      },
    });
    let spawnCalled = false;
    const sdk: SdkDeps = {
      createOpencodeClient: () => client,
      createOpencode: async () => {
        spawnCalled = true;
        return {
          client,
          server: { url: "http://127.0.0.1:4096", close: () => {} },
        };
      },
    };
    const handle = await connectOrStartServer(MOCK_CONFIG, { sdk });
    assert.equal(handle.mode, "spawn");
    assert.ok(spawnCalled);
  });

  it("throws SPAWN_FAILED when both attach and spawn fail", async () => {
    const client = makeMockClient({
      global: {
        health: async () => { throw new Error("no server"); },
      },
    });
    const sdk: SdkDeps = {
      createOpencodeClient: () => client,
      createOpencode: async () => { throw new Error("spawn crash"); },
    };
    await assert.rejects(
      () => connectOrStartServer(MOCK_CONFIG, { sdk }),
      (err: any) => err instanceof AppError && err.code === "SPAWN_FAILED",
    );
  });
});

describe("opencode.createSession", () => {
  it("returns session id on success", async () => {
    const client = makeMockClient();
    const result = await createSession(client, "test");
    assert.equal(result.id, "sess-123");
  });

  it("throws SESSION_CREATE_FAILED when no id returned", async () => {
    const client = makeMockClient({
      session: {
        create: async () => ({ data: {} }),
      },
    });
    await assert.rejects(
      () => createSession(client, "test"),
      (err: any) => err instanceof AppError && err.code === "SESSION_CREATE_FAILED",
    );
  });
});

describe("opencode.validateAgent", () => {
  it("passes when agent exists", async () => {
    const client = makeMockClient({
      app: {
        agents: async () => ({
          data: [
            { name: "coder", mode: "primary" },
            { name: "reviewer", mode: "subagent" },
          ],
        }),
      },
    });
    await assert.doesNotReject(() => validateAgent(client, "coder"));
  });

  it("throws CONFIG_INVALID when agent not found", async () => {
    const client = makeMockClient({
      app: {
        agents: async () => ({
          data: [
            { name: "coder", mode: "primary" },
            { name: "reviewer", mode: "subagent" },
          ],
        }),
      },
    });
    await assert.rejects(
      () => validateAgent(client, "nonexistent"),
      (err: any) =>
        err instanceof AppError &&
        err.code === "CONFIG_INVALID" &&
        err.message.includes("nonexistent"),
    );
  });

  it("skips validation when agents() call fails", async () => {
    const client = makeMockClient({
      app: {
        agents: async () => { throw new Error("endpoint not available"); },
      },
    });
    await assert.doesNotReject(() => validateAgent(client, "any-agent"));
  });

  it("logs warning when agents() API call fails", async () => {
    const client = makeMockClient({
      app: {
        agents: async () => { throw new Error("endpoint not available"); },
      },
    });
    const warningCalls: string[] = [];
    const mockLogger = {
      info: (msg: string) => warningCalls.push(msg),
      debug: (_msg: string) => {},
      error: (_msg: string) => {},
      separator: () => {},
    };
    await assert.doesNotReject(() => validateAgent(client, "coder", mockLogger as any));
    assert.ok(
      warningCalls.some((msg) => msg.includes("WARNING") && msg.includes("Could not verify")),
      `Expected warning message with "WARNING" and "Could not verify", got: ${warningCalls.join(", ")}`,
    );
  });

  it("throws when agents() fails for reasons other than API unavailability", async () => {
    const client = makeMockClient({
      app: {
        agents: async () => { throw new Error("socket hang up"); },
      },
    });
    await assert.rejects(
      () => validateAgent(client, "coder"),
      (err: any) =>
        err instanceof AppError &&
        err.code === "UNKNOWN" &&
        err.message.includes("socket hang up"),
    );
  });

  it("agent is validation-only (pre-check), not passed to SDK session methods", async () => {
    let agentsCalled = false;
    let sessionCreateParams: any;
    const client = makeMockClient({
      app: {
        agents: async () => {
          agentsCalled = true;
          return { data: [{ name: "coder", mode: "primary" }] };
        },
      },
      session: {
        create: async (params: any) => {
          sessionCreateParams = params;
          return { data: { id: "sess-123" } };
        },
        prompt: async () => ({
          data: {
            info: { id: "msg-1", sessionID: "sess-123", role: "assistant" },
            parts: [{ type: "text", text: "response" }],
          },
        }),
      },
    });

    await validateAgent(client, "coder");
    const sessionResult = await createSession(client, "test-session");

    assert.ok(agentsCalled, "agents() was called for validation");
    assert.equal(sessionCreateParams.title, "test-session");
    assert.equal(sessionCreateParams.agent, undefined, "agent is NOT passed to session.create");
  });
});

describe("opencode.injectPromptTemplate", () => {
  it("calls session.prompt with noReply true", async () => {
    let capturedParams: any;
    const client = makeMockClient({
      session: {
        prompt: async (params: any) => {
          capturedParams = params;
          return { data: { info: {}, parts: [] } };
        },
      },
    });
    await injectPromptTemplate(client, "sess-1", "# Rules\nDo things.");
    assert.equal(capturedParams.sessionID, "sess-1");
    assert.equal(capturedParams.noReply, true);
    assert.equal(capturedParams.parts[0].type, "text");
    assert.equal(capturedParams.parts[0].text, "# Rules\nDo things.");
  });
});

describe("opencode.executePrompt", () => {
  it("sends task and returns result", async () => {
    const client = makeMockClient();
    const result = await executePrompt(client, "sess-1", "do something");
    assert.ok(result.data);
    const data = result.data as any;
    assert.equal(data.info.id, "msg-1");
    assert.equal(data.parts[0].text, "mock response");
  });

  it("passes model to session.prompt (not session.create)", async () => {
    let capturedPromptParams: any;
    let capturedCreateParams: any;
    const client = makeMockClient({
      session: {
        create: async (params: any) => {
          capturedCreateParams = params;
          return { data: { id: "sess-new" } };
        },
        prompt: async (params: any) => {
          capturedPromptParams = params;
          return {
            data: {
              info: { id: "m1", sessionID: "sess-new", role: "assistant" },
              parts: [{ type: "text", text: "ok" }],
            },
          };
        },
      },
    });
    await executePrompt(client, "sess-new", "task", { model: "openai/gpt-4" });
    assert.deepEqual(capturedPromptParams.model, { providerID: "openai", modelID: "gpt-4" });
  });

  it("passes model when specified", async () => {
    let capturedParams: any;
    const client = makeMockClient({
      session: {
        prompt: async (params: any) => {
          capturedParams = params;
          return {
            data: {
              info: { id: "m1", sessionID: "s1", role: "assistant" },
              parts: [{ type: "text", text: "ok" }],
            },
          };
        },
      },
    });
    await executePrompt(client, "sess-1", "task", { model: "openai/gpt-4" });
    assert.deepEqual(capturedParams.model, { providerID: "openai", modelID: "gpt-4" });
  });

  it("passes structured output format when specified", async () => {
    let capturedParams: any;
    const client = makeMockClient({
      session: {
        prompt: async (params: any) => {
          capturedParams = params;
          return {
            data: {
              info: { id: "m1", sessionID: "s1", role: "assistant", structured: { result: 42 } },
              parts: [{ type: "text", text: "done" }],
            },
          };
        },
      },
    });
    await executePrompt(client, "sess-1", "extract", {
      structured: { schema: { type: "object" }, retryCount: 2 },
    });
    assert.equal(capturedParams.format.type, "json_schema");
    assert.deepEqual(capturedParams.format.schema, { type: "object" });
    assert.equal(capturedParams.format.retryCount, 2);
  });
});

describe("opencode.describeModelSelection", () => {
  it("describes explicit provider/model strings", () => {
    assert.equal(
      describeModelSelection("minimax-cn/MiniMax-M2.7"),
      "provider=minimax-cn model=MiniMax-M2.7",
    );
  });

  it("describes missing model as server default", () => {
    assert.equal(describeModelSelection(""), "server default");
  });
});

describe("opencode.abortSession", () => {
  it("calls session.abort", async () => {
    let aborted = false;
    const client = makeMockClient({
      session: {
        abort: async (_p: any) => { aborted = true; return { data: {} }; },
      },
    });
    await abortSession(client, "sess-1");
    assert.ok(aborted);
  });

  it("throws SESSION_ABORT_FAILED on error", async () => {
    const client = makeMockClient({
      session: {
        abort: async () => { throw new Error("abort failed"); },
      },
    });
    await assert.rejects(
      () => abortSession(client, "sess-1"),
      (err: any) => err instanceof AppError && err.code === "SESSION_ABORT_FAILED",
    );
  });
});

describe("opencode.deleteSession", () => {
  it("calls session.delete", async () => {
    let deleted = false;
    const client = makeMockClient({
      session: {
        delete: async (_p: any) => { deleted = true; return { data: {} }; },
      },
    });
    await deleteSession(client, "sess-1");
    assert.ok(deleted);
  });

  it("throws SESSION_DELETE_FAILED on error", async () => {
    const client = makeMockClient({
      session: {
        delete: async () => { throw new Error("delete failed"); },
      },
    });
    await assert.rejects(
      () => deleteSession(client, "sess-1"),
      (err: any) => err instanceof AppError && err.code === "SESSION_DELETE_FAILED",
    );
  });
});

describe("opencode cleanup order", () => {
  it("calls abort then delete then close in correct order", async () => {
    const callOrder: string[] = [];
    const client = makeMockClient({
      session: {
        abort: async () => { callOrder.push("abort"); return {}; },
        delete: async () => { callOrder.push("delete"); return {}; },
      },
    });
    const server = {
      url: "http://localhost:4096",
      close: () => { callOrder.push("close"); },
    };

    await abortSession(client, "sess-1");
    await deleteSession(client, "sess-1");
    await closeServer(server);

    assert.deepEqual(callOrder, ["abort", "delete", "close"]);
  });
});

describe("opencode.closeServer", () => {
  it("does nothing when server is null", async () => {
    await assert.doesNotReject(() => closeServer(null));
  });

  it("calls close on server", async () => {
    let closed = false;
    const server = { url: "http://localhost:4096", close: () => { closed = true; } };
    await closeServer(server);
    assert.equal(closed, true);
  });

  it("swallows errors from close", async () => {
    const server = {
      url: "http://localhost:4096",
      close: () => { throw new Error("close failed"); },
    };
    await assert.doesNotReject(() => closeServer(server));
  });
});

describe("opencode error handling", () => {
  it("AppError has correct code and message", () => {
    const err = new AppError("ATTACH_FAILED", "test error", new Error("cause"));
    assert.equal(err.code, "ATTACH_FAILED");
    assert.equal(err.message, "test error");
    assert.ok(err.cause);
    assert.equal(err.name, "AppError");
  });
});
