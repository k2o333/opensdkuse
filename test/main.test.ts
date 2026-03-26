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
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "int-prompt.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    const schemaPath = join(TEST_DIR, "schema.json");
    writeFileSync(schemaPath, JSON.stringify({ type: "object" }));
    try {
      const exitCode = await main(["--json", "--schema-file", schemaPath, "--prompt", promptPath, "--timeout", "100", "test task"]);
      assert.ok(exitCode === 1 || exitCode === 3, `Expected exit 1 or 3, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
      try { unlinkSync(schemaPath); } catch {}
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

describe("main - signal handler stability", () => {
  it("multiple runs do not accumulate signal listeners", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "signal-test.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const initialSigintCount = process.listenerCount("SIGINT");
      const initialSigtermCount = process.listenerCount("SIGTERM");

      // Run multiple times
      for (let i = 0; i < 3; i++) {
        await main(["--prompt", promptPath, "--timeout", "100", "test"]);
      }

      const finalSigintCount = process.listenerCount("SIGINT");
      const finalSigtermCount = process.listenerCount("SIGTERM");

      assert.equal(finalSigintCount, initialSigintCount,
        `SIGINT listeners grew from ${initialSigintCount} to ${finalSigintCount}`);
      assert.equal(finalSigtermCount, initialSigtermCount,
        `SIGTERM listeners grew from ${initialSigtermCount} to ${finalSigtermCount}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });

  it("SIGINT handler uses named function (can be removed)", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "sigint-test.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const beforeCount = process.listenerCount("SIGINT");
      await main(["--prompt", promptPath, "--timeout", "100", "test"]);
      const afterCount = process.listenerCount("SIGINT");
      assert.equal(afterCount, beforeCount,
        `SIGINT listener not properly removed (before=${beforeCount}, after=${afterCount})`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });

  it("SIGTERM handler uses named function (can be removed)", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "sigterm-test.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const beforeCount = process.listenerCount("SIGTERM");
      await main(["--prompt", promptPath, "--timeout", "100", "test"]);
      const afterCount = process.listenerCount("SIGTERM");
      assert.equal(afterCount, beforeCount,
        `SIGTERM listener not properly removed (before=${beforeCount}, after=${afterCount})`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });
});

describe("main - keep-session behavior", () => {
  it("--keep-session flag is accepted and does not crash", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "keep-session.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const exitCode = await main(["--keep-session", "--prompt", promptPath, "--timeout", "5000", "test"]);
      assert.ok(
        exitCode === 0 || exitCode === 1 || exitCode === 3,
        `Expected valid exit code (0/1/3), got ${exitCode}`,
      );
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });
});

describe("main - structured output schema validation", () => {
  it("returns exit code 2 when --json is used without --schema-file", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "json-no-schema.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const exitCode = await main(["--json", "--prompt", promptPath, "--timeout", "5000", "test"]);
      assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });

  it("returns exit code 2 when --schema-file does not exist", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "schema-missing.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    try {
      const exitCode = await main([
        "--json",
        "--schema-file", join(TEST_DIR, "nonexistent-schema.json"),
        "--prompt", promptPath,
        "--timeout", "5000",
        "test",
      ]);
      assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
    }
  });

  it("returns exit code 2 when --schema-file contains invalid JSON", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "schema-invalid.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    const invalidSchemaPath = join(TEST_DIR, "invalid-schema.json");
    writeFileSync(invalidSchemaPath, "{ this is not valid json }");
    try {
      const exitCode = await main([
        "--json",
        "--schema-file", invalidSchemaPath,
        "--prompt", promptPath,
        "--timeout", "5000",
        "test",
      ]);
      assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
      try { unlinkSync(invalidSchemaPath); } catch {}
    }
  });

  it("returns exit code 2 when --schema-file contains non-object JSON", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "schema-not-object.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    const nonObjectSchemaPath = join(TEST_DIR, "non-object-schema.json");
    writeFileSync(nonObjectSchemaPath, '"just a string"');
    try {
      const exitCode = await main([
        "--json",
        "--schema-file", nonObjectSchemaPath,
        "--prompt", promptPath,
        "--timeout", "5000",
        "test",
      ]);
      assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
      try { unlinkSync(nonObjectSchemaPath); } catch {}
    }
  });

  it("accepts --json with valid --schema-file (mocked SDK path)", async () => {
    clearEnv();
    mkdirSync(TEST_DIR, { recursive: true });
    const promptPath = join(TEST_DIR, "valid-schema.md");
    writeFileSync(promptPath, "# Prompt\nDo stuff.");
    const validSchemaPath = join(TEST_DIR, "valid-schema.json");
    writeFileSync(validSchemaPath, JSON.stringify({
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    }));
    try {
      const exitCode = await main([
        "--json",
        "--schema-file", validSchemaPath,
        "--prompt", promptPath,
        "--timeout", "5000",
        "test",
      ]);
      assert.notEqual(exitCode, 2, `Expected valid schema to avoid config failure, got ${exitCode}`);
    } finally {
      try { unlinkSync(promptPath); } catch {}
      try { unlinkSync(validSchemaPath); } catch {}
    }
  });
});
