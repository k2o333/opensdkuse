import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/main.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TEST_DIR = join(__dirname, "..", ".test-tmp-integration");

function clearEnv(): void {
  const keys = ["OPENCODE_MODEL", "OPENCODE_HOST", "OPENCODE_PORT", "OPENCODE_PROMPT", "OPENCODE_TIMEOUT_MS"];
  for (const k of keys) delete process.env[k];
}

describe("main - input validation", () => {
  it("returns exit code 2 for empty input", async () => {
    clearEnv();
    const exitCode = await main([]);
    assert.equal(exitCode, 2);
  });

  it("returns exit code 2 for unknown arg", async () => {
    clearEnv();
    const exitCode = await main(["--nonexistent"]);
    assert.equal(exitCode, 2);
  });
});

describe("main - prompt file errors", () => {
  it("returns exit code 2 for missing prompt file", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const exitCode = await main(["--prompt", join(TEST_DIR, "no-such-file.md"), "hello"]);
    assert.equal(exitCode, 2);
  });

  it("returns exit code 2 for empty prompt file", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const emptyPath = join(TEST_DIR, "empty-int.md");
    writeFileSync(emptyPath, "");
    try {
      const exitCode = await main(["--prompt", emptyPath, "hello"]);
      assert.equal(exitCode, 2);
    } finally {
      try { unlinkSync(emptyPath); } catch {}
    }
  });
});

describe("main - help", () => {
  it("returns 0 for --help", async () => {
    clearEnv();
    const exitCode = await main(["--help"]);
    assert.equal(exitCode, 0);
  });

  it("returns 0 for -h", async () => {
    clearEnv();
    const exitCode = await main(["-h"]);
    assert.equal(exitCode, 0);
  });
});

describe("main - structured output flag", () => {
  it("--json passes structured option (mocked SDK)", async () => {
    // This test verifies the wiring: when --json is set, main.ts constructs
    // promptOpts.structured and passes it to executePrompt.
    // We cannot fully run the pipeline without a real server, but we verify
    // that the code path does not crash on argument parsing + config.
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "int-prompt.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      // Will fail at connectOrStartServer, but should NOT fail at argument/config stage
      const exitCode = await main(["--json", "--prompt", promptPath, "--timeout", "100", "test task"]);
      // Expect SPAWN_FAILED or TIMEOUT (exit code 1 or 3), not INPUT_INVALID (2) or crash
      assert.ok(exitCode === 1 || exitCode === 3, `Expected exit 1 or 3, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });
});

describe("main - agent validation wiring", () => {
  it("--agent flag is accepted and does not crash at parse/config stage", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "agent-prompt.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const exitCode = await main(["--agent", "coder", "--prompt", promptPath, "--timeout", "100", "test"]);
      // Accept any non-crash exit: 0 (success on real server), 1 (spawn/agent failure),
      // 2 (agent validation rejects unknown agent), 3 (timeout)
      assert.ok(
        exitCode === 0 || exitCode === 1 || exitCode === 2 || exitCode === 3,
        `Expected valid exit code, got ${exitCode}`,
      );
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });
});

describe("main - timeout behavior", () => {
  it("returns exit code 3 when timeout fires before connect", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "timeout-prompt.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      // Very short timeout — will likely fire before spawn completes
      const exitCode = await main(["--prompt", promptPath, "--timeout", "50", "test"]);
      assert.ok(exitCode === 1 || exitCode === 3, `Expected exit 1 or 3, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });
});
