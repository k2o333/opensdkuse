import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createConfig, getServerUrl } from "../src/config.js";
import type { AppConfig } from "../src/config.js";

function clearEnv(): void {
  const keys = ["OPENCODE_MODEL", "OPENCODE_HOST", "OPENCODE_PORT", "OPENCODE_PROMPT", "OPENCODE_TIMEOUT_MS", "OPENCODE_MAX_INPUT_LENGTH"];
  for (const k of keys) delete process.env[k];
}

describe("config.createConfig - defaults", () => {
  it("returns default values when no args or env", () => {
    clearEnv();
    const cfg = createConfig();
    assert.equal(cfg.model, "");
    assert.equal(cfg.hostname, "127.0.0.1");
    assert.equal(cfg.port, 4096);
    assert.equal(cfg.promptFile, "prompt.md");
    assert.equal(cfg.sessionTitle, "opencode-cli-session");
    assert.equal(cfg.serverStartupTimeoutMs, 30000);
    assert.equal(cfg.executionTimeoutMs, 2700000);
    assert.equal("startupTimeoutMs" in cfg, false);
    assert.equal(cfg.maxInputLength, 100000);
  });
});

describe("config.createConfig - env overrides", () => {
  it("reads OPENCODE_MODEL", () => {
    clearEnv();
    process.env.OPENCODE_MODEL = "anthropic/claude-3";
    const cfg = createConfig();
    assert.equal(cfg.model, "anthropic/claude-3");
    delete process.env.OPENCODE_MODEL;
  });

  it("reads OPENCODE_HOST", () => {
    clearEnv();
    process.env.OPENCODE_HOST = "10.0.0.5";
    const cfg = createConfig();
    assert.equal(cfg.hostname, "10.0.0.5");
    delete process.env.OPENCODE_HOST;
  });

  it("reads OPENCODE_PORT", () => {
    clearEnv();
    process.env.OPENCODE_PORT = "8080";
    const cfg = createConfig();
    assert.equal(cfg.port, 8080);
    delete process.env.OPENCODE_PORT;
  });

  it("reads OPENCODE_PROMPT", () => {
    clearEnv();
    process.env.OPENCODE_PROMPT = "custom.md";
    const cfg = createConfig();
    assert.equal(cfg.promptFile, "custom.md");
    delete process.env.OPENCODE_PROMPT;
  });

  it("reads OPENCODE_TIMEOUT_MS", () => {
    clearEnv();
    process.env.OPENCODE_TIMEOUT_MS = "60000";
    const cfg = createConfig();
    assert.equal(cfg.executionTimeoutMs, 60000);
    assert.equal(cfg.serverStartupTimeoutMs, 30000);
    delete process.env.OPENCODE_TIMEOUT_MS;
  });

  it("ignores invalid OPENCODE_PORT (non-numeric)", () => {
    clearEnv();
    process.env.OPENCODE_PORT = "abc";
    const cfg = createConfig();
    assert.equal(cfg.port, 4096);
    delete process.env.OPENCODE_PORT;
  });

  it("ignores invalid OPENCODE_PORT (negative)", () => {
    clearEnv();
    process.env.OPENCODE_PORT = "-1";
    const cfg = createConfig();
    assert.equal(cfg.port, 4096);
    delete process.env.OPENCODE_PORT;
  });

  it("ignores whitespace-only env values", () => {
    clearEnv();
    process.env.OPENCODE_MODEL = "   ";
    const cfg = createConfig();
    assert.equal(cfg.model, "");
    delete process.env.OPENCODE_MODEL;
  });
});

describe("config.createConfig - CLI overrides", () => {
  it("CLI model overrides env and defaults", () => {
    clearEnv();
    process.env.OPENCODE_MODEL = "env-model";
    const cfg = createConfig({ model: "cli-model" });
    assert.equal(cfg.model, "cli-model");
    delete process.env.OPENCODE_MODEL;
  });

  it("CLI host overrides env", () => {
    clearEnv();
    process.env.OPENCODE_HOST = "env-host";
    const cfg = createConfig({ host: "cli-host" });
    assert.equal(cfg.hostname, "cli-host");
    delete process.env.OPENCODE_HOST;
  });

  it("CLI port overrides env", () => {
    clearEnv();
    process.env.OPENCODE_PORT = "1111";
    const cfg = createConfig({ port: 2222 });
    assert.equal(cfg.port, 2222);
    delete process.env.OPENCODE_PORT;
  });

  it("CLI promptFile overrides env", () => {
    clearEnv();
    process.env.OPENCODE_PROMPT = "env.md";
    const cfg = createConfig({ promptFile: "cli.md" });
    assert.equal(cfg.promptFile, "cli.md");
    delete process.env.OPENCODE_PROMPT;
  });

  it("CLI timeoutMs overrides env", () => {
    clearEnv();
    process.env.OPENCODE_TIMEOUT_MS = "1000";
    const cfg = createConfig({ timeoutMs: 9999 });
    assert.equal(cfg.executionTimeoutMs, 9999);
    assert.equal(cfg.serverStartupTimeoutMs, 30000);
    delete process.env.OPENCODE_TIMEOUT_MS;
  });

  it("port=0 from CLI is accepted (0 is a valid port)", () => {
    clearEnv();
    const cfg = createConfig({ port: 0 });
    // port=0 passes the `!== undefined` check and gets set
    assert.equal(cfg.port, 0);
  });

  it("--timeout maps to executionTimeoutMs", () => {
    clearEnv();
    const cfg = createConfig({ timeoutMs: 60000 });
    assert.equal(cfg.executionTimeoutMs, 60000);
  });

  it("executionTimeoutMs has a sensible default", () => {
    clearEnv();
    const cfg = createConfig({});
    assert.ok(cfg.executionTimeoutMs !== undefined);
    assert.ok(cfg.executionTimeoutMs > 0);
  });

  it("serverStartupTimeoutMs has internal default", () => {
    clearEnv();
    const cfg = createConfig({});
    assert.ok(cfg.serverStartupTimeoutMs !== undefined);
    assert.ok(cfg.serverStartupTimeoutMs > 0);
  });

  it("OPENCODE_TIMEOUT_MS sets executionTimeoutMs", () => {
    clearEnv();
    process.env.OPENCODE_TIMEOUT_MS = "45000";
    const cfg = createConfig();
    assert.equal(cfg.executionTimeoutMs, 45000);
    delete process.env.OPENCODE_TIMEOUT_MS;
  });

  it("does not retain legacy startupTimeoutMs field", () => {
    clearEnv();
    const cfg = createConfig({ timeoutMs: 45000 });
    assert.equal("startupTimeoutMs" in cfg, false);
  });
});

describe("config.getServerUrl", () => {
  it("returns correct URL", () => {
    const cfg: AppConfig = {
      model: "",
      hostname: "192.168.1.1",
      port: 3000,
      promptFile: "p.md",
      sessionTitle: "t",
      serverStartupTimeoutMs: 5000,
      executionTimeoutMs: 10000,
      maxInputLength: 1000,
    };
    assert.equal(getServerUrl(cfg), "http://192.168.1.1:3000");
  });
});
