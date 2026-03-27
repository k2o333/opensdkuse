import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  summarizeDateLogs,
  summarizeSessionLogs,
} from "../src/opencode-log-stats.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const TEST_DIR = join(__dirname, "..", ".test-tmp-opencode-log-stats");

function resetDir(): void {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

describe("opencode-log-stats.summarizeDateLogs", () => {
  it("counts llm calls per file for a given date", () => {
    resetDir();
    writeFileSync(
      join(TEST_DIR, "2026-03-27T010000.log"),
      [
        "INFO  service=server method=GET path=/session request",
        "INFO  service=llm providerID=opencode modelID=minimax-m2.5-free sessionID=ses_a small=false agent=build mode=primary stream",
        "ERROR service=llm providerID=opencode modelID=minimax-m2.5-free sessionID=ses_a error={}",
      ].join("\n"),
    );
    writeFileSync(
      join(TEST_DIR, "2026-03-27T020000.log"),
      [
        "INFO  service=llm providerID=opencode modelID=minimax-m2.5-free sessionID=ses_b small=false agent=build mode=primary stream",
        "INFO  service=llm providerID=opencode modelID=minimax-m2.5-free sessionID=ses_c small=false agent=build mode=primary stream",
      ].join("\n"),
    );
    writeFileSync(
      join(TEST_DIR, "2026-03-26T230000.log"),
      "INFO  service=llm providerID=opencode modelID=old-model sessionID=ses_old small=false agent=build mode=primary stream\n",
    );

    const stats = summarizeDateLogs(TEST_DIR, "2026-03-27");

    assert.equal(stats.date, "2026-03-27");
    assert.equal(stats.totalLlmCalls, 3);
    assert.deepEqual(
      stats.files,
      [
        { file: "2026-03-27T010000.log", llmCalls: 1 },
        { file: "2026-03-27T020000.log", llmCalls: 2 },
      ],
    );
  });
});

describe("opencode-log-stats.summarizeSessionLogs", () => {
  it("counts message requests and llm calls for one session", () => {
    resetDir();
    const sessionId = "ses_demo";

    writeFileSync(
      join(TEST_DIR, "2026-03-27T030000.log"),
      [
        `INFO  service=session id=${sessionId} slug=test created`,
        `INFO  service=server method=POST path=/session/${sessionId}/message request`,
        `INFO  service=server status=started method=POST path=/session/${sessionId}/message request`,
        `INFO  service=server status=completed duration=4 method=POST path=/session/${sessionId}/message request`,
        `INFO  service=server method=POST path=/session/${sessionId}/message request`,
        `INFO  service=server status=started method=POST path=/session/${sessionId}/message request`,
        `INFO  service=session.prompt step=0 sessionID=${sessionId} loop`,
        `INFO  service=llm providerID=opencode modelID=minimax-m2.5-free sessionID=${sessionId} small=false agent=build mode=primary stream`,
        `INFO  service=session.prompt step=1 sessionID=${sessionId} loop`,
        `INFO  service=session.prompt sessionID=${sessionId} exiting loop`,
        `INFO  service=server method=POST path=/session/${sessionId}/abort request`,
      ].join("\n"),
    );

    const stats = summarizeSessionLogs(TEST_DIR, sessionId);

    assert.equal(stats.sessionId, sessionId);
    assert.equal(stats.messageRequests, 2);
    assert.equal(stats.llmCalls, 1);
    assert.deepEqual(stats.providers, ["opencode"]);
    assert.deepEqual(stats.models, ["minimax-m2.5-free"]);
    assert.deepEqual(stats.logFiles, ["2026-03-27T030000.log"]);
    assert.deepEqual(stats.errors, []);
  });

  it("captures llm errors without counting them as extra llm calls", () => {
    resetDir();
    const sessionId = "ses_error";

    writeFileSync(
      join(TEST_DIR, "2026-03-27T040000.log"),
      [
        `INFO  service=server method=POST path=/session/${sessionId}/message request`,
        `INFO  service=llm providerID=minimax-cn-coding-plan modelID=MiniMax-M2.7 sessionID=${sessionId} small=false agent=build mode=primary stream`,
        `ERROR service=llm providerID=minimax-cn-coding-plan modelID=MiniMax-M2.7 sessionID=${sessionId} small=false agent=build mode=primary error={"error":{"type":"rate_limit_error","message":"usage limit exceeded"}} stream error`,
      ].join("\n"),
    );

    const stats = summarizeSessionLogs(TEST_DIR, sessionId);

    assert.equal(stats.messageRequests, 1);
    assert.equal(stats.llmCalls, 1);
    assert.deepEqual(stats.providers, ["minimax-cn-coding-plan"]);
    assert.deepEqual(stats.models, ["MiniMax-M2.7"]);
    assert.equal(stats.errors.length, 1);
    assert.match(stats.errors[0], /rate_limit_error|usage limit exceeded/);
  });
});
