# OpenCode CLI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current CLI's misleading behaviors around prompt/template usage, error propagation, and logging so runtime outcomes are observable and the interface matches its documented contract.

**Architecture:** Keep the current `run.ts -> main.ts -> opencode.ts -> response.ts` flow and make targeted corrections instead of refactoring the CLI. Address correctness first, then align flag semantics and docs, then tighten warnings and UX around `--prompt`.

**Tech Stack:** TypeScript, Node.js built-in test runner, `ts-node`, OpenCode SDK v2 adapter layer

---

### File Map

**Modify:**
- `src/response.ts` - normalize SDK top-level errors in addition to `info.error`
- `src/main.ts` - wire logging semantics, preserve exit behavior, surface clearer warnings
- `src/logger.ts` - support actual log levels instead of unconditional `info`
- `src/cli.ts` - either remove `--info` or make it functional in help text and parsing behavior
- `src/prompt.ts` - improve prompt-template issue detection and warning wording
- `README.md` - update CLI contract and prompt usage examples
- `test/response.test.ts` - add regression coverage for top-level SDK errors
- `test/logger.test.ts` - add level-behavior tests
- `test/cli.test.ts` - align tests with chosen `--info` behavior
- `test/main.test.ts` - add integration-level assertions for warning/logging behavior where practical
- `test/prompt.test.ts` - add coverage for mixed template/task misuse

**Create if needed:**
- `prompts/plan-role-only.md` - example of a valid role-only planning template without embedded one-off task

---

### Task 1: Fix SDK Error Propagation

**Files:**
- Modify: `src/response.ts`
- Test: `test/response.test.ts`

- [ ] **Step 1: Write the failing test**

Add a case showing `normalizeSdkResponse()` receives a result with top-level `error` but no `info.error`, and must still normalize to `error != null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/response.test.ts`
Expected: FAIL because the current implementation ignores `result.error`.

- [ ] **Step 3: Write minimal implementation**

Update normalization to merge error sources in this order:
1. `data.info.error`
2. top-level `result.error`

Map the top-level SDK error into the same normalized shape used elsewhere.

- [ ] **Step 4: Run targeted tests**

Run: `npm test -- test/response.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `npm test`
Run: `npm run typecheck`
Expected: both PASS

- [ ] **Step 6: Commit**

```bash
git add src/response.ts test/response.test.ts
git commit -m "Fix SDK top-level error normalization"
```

---

### Task 2: Make Log Levels Match CLI Flags

**Files:**
- Modify: `src/logger.ts`
- Modify: `src/main.ts`
- Modify: `src/cli.ts`
- Test: `test/logger.test.ts`
- Test: `test/cli.test.ts`

- [ ] **Step 1: Decide the contract**

Use this behavior:
- default: only `error`
- `--info`: `info` + `error`
- `--debug`: `debug` + `info` + `error`

Keep `--debug` implying `info`.

- [ ] **Step 2: Write failing tests**

Add tests that prove:
- `createLogger(false, false)` suppresses `info`
- `createLogger(false, true)` prints `info`
- `createLogger(true, true)` prints `debug`
- CLI help and parser reflect the active `--info` behavior

- [ ] **Step 3: Run targeted tests to verify failure**

Run: `npm test -- test/logger.test.ts`
Run: `npm test -- test/cli.test.ts`
Expected: FAIL against current unconditional `info()` logging.

- [ ] **Step 4: Implement minimal logger/config wiring**

Change logger construction so `main()` passes both `debug` and `info` intent, while preserving existing debug output.

- [ ] **Step 5: Run targeted verification**

Run: `npm test -- test/logger.test.ts`
Run: `npm test -- test/cli.test.ts`
Expected: PASS

- [ ] **Step 6: Run full verification**

Run: `npm test`
Run: `npm run typecheck`
Expected: both PASS

- [ ] **Step 7: Commit**

```bash
git add src/logger.ts src/main.ts src/cli.ts test/logger.test.ts test/cli.test.ts
git commit -m "Align log levels with CLI flags"
```

---

### Task 3: Clarify `--prompt` Semantics and Template Misuse

**Files:**
- Modify: `src/prompt.ts`
- Modify: `src/main.ts`
- Modify: `README.md`
- Test: `test/prompt.test.ts`
- Test: `test/main.test.ts`
- Create if needed: `prompts/plan-role-only.md`

- [ ] **Step 1: Write failing tests**

Add coverage showing templates with embedded repo-specific one-off instructions are flagged clearly, including cases where they contain both role description and fixed output instructions.

- [ ] **Step 2: Run targeted tests to verify failure or insufficient coverage**

Run: `npm test -- test/prompt.test.ts`
Expected: existing heuristics are too narrow or wording is not precise enough.

- [ ] **Step 3: Tighten warning strategy**

Keep this as a warning, not a hard error, but make the message actionable:
- explain that `--prompt` is injected before the user task
- explain that embedding a concrete task can conflict with the positional task
- recommend keeping `--prompt` role-only

- [ ] **Step 4: Add a valid replacement example**

Either:
- create `prompts/plan-role-only.md`, or
- rewrite docs to show how to move the concrete ask into the positional task instead of the template

- [ ] **Step 5: Update README**

Document:
- two-phase injection model
- why `prompts/plan.md` style files are unsafe as shared templates
- one correct command example

- [ ] **Step 6: Run verification**

Run: `npm test -- test/prompt.test.ts`
Run: `npm test -- test/main.test.ts`
Run: `npm test`
Run: `npm run typecheck`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/prompt.ts src/main.ts README.md test/prompt.test.ts test/main.test.ts prompts/plan-role-only.md
git commit -m "Clarify prompt template semantics"
```

---

### Task 4: Improve Attach/Spawn Diagnostics

**Files:**
- Modify: `src/opencode.ts`
- Test: `test/opencode.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test asserting that when attach fails for a non-health reason, the logger receives the underlying message summary.

- [ ] **Step 2: Run targeted test to verify failure**

Run: `npm test -- test/opencode.test.ts`
Expected: FAIL because the current log drops the attach error detail.

- [ ] **Step 3: Implement minimal diagnostic improvement**

Log concise root-cause context without dumping noisy stacks, for example:
- connection refused
- fetch failed
- timeout

Do not change fallback behavior.

- [ ] **Step 4: Run verification**

Run: `npm test -- test/opencode.test.ts`
Run: `npm test`
Run: `npm run typecheck`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/opencode.ts test/opencode.test.ts
git commit -m "Improve attach fallback diagnostics"
```

---

### Task 5: Reconcile `--keep-session` Naming and Behavior

**Files:**
- Modify: `README.md`
- Modify: `src/cli.ts`
- Modify: `src/main.ts`
- Test: `test/main.test.ts`

- [ ] **Step 1: Choose one direction**

Preferred minimal path:
- keep behavior as-is
- clarify docs and runtime message to say session record is kept, but active execution is still aborted and spawned server is still closed

Alternative larger change:
- actually preserve resumable session/server lifecycle

Do not choose the larger change unless there is a concrete product need for resumable interactive sessions.

- [ ] **Step 2: Write tests/doc assertions**

Add or update tests around emitted message and cleanup behavior expectations.

- [ ] **Step 3: Implement the minimal wording fix**

Change the user-facing message from "Session kept" to wording that does not imply resumable live state.

- [ ] **Step 4: Run verification**

Run: `npm test -- test/main.test.ts`
Run: `npm test`
Run: `npm run typecheck`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add README.md src/cli.ts src/main.ts test/main.test.ts
git commit -m "Clarify keep-session behavior"
```

---

### Task 6: Final Documentation Pass

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update examples**

Ensure examples reflect:
- role-only prompt templates
- actual `--info` semantics
- realistic debug output expectations

- [ ] **Step 2: Update known limitations**

Call out:
- attach-first strategy
- keep-session scope
- warning-only prompt misuse detection

- [ ] **Step 3: Run final verification**

Run: `npm test`
Run: `npm run typecheck`
Expected: both PASS

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Refresh CLI documentation"
```

---

### Recommended Execution Order

1. Task 1: error propagation
2. Task 2: log levels
3. Task 3: prompt semantics
4. Task 4: diagnostics
5. Task 5: keep-session wording
6. Task 6: documentation pass

This order fixes correctness first, then observability, then UX/docs.

---

### Verification Checklist

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] Manual smoke test with a role-only prompt:

```bash
node --loader ts-node/esm run.ts \
  --info \
  --prompt prompt.md \
  "Analyze this repository's session lifecycle"
```

- [ ] Manual misuse test with an embedded-task prompt:

```bash
node --loader ts-node/esm run.ts \
  --info \
  --prompt prompts/plan.md \
  "任务"
```

Expected: actionable warning explaining template misuse, not a silent semantic footgun.
