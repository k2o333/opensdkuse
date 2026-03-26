# subagent-C 任务文档：Docs & Tests

## 你的角色

你是 **subagent-C**，负责 README/help 对齐、关键回归测试补齐、已知限制章节。
任务文档在 `docs/mvpfix2/task-agent-C.md`，请完整阅读后再动手。

## 代码库信息

- 项目根目录：`/home/quan/proj/opensdkuse`
- 你的主战场：`README.md`、`test/*.test.ts`、`src/cli.ts`（仅 help 文案）
- 你必须在 subagent-A 和 subagent-B 完成后才能正式开工（否则文档和测试会按旧行为写）

## 禁区（不要主动修改）

- `src/response.ts` 核心逻辑
- `src/config.ts` 结构定义
- `src/opencode.ts` 核心逻辑
- `src/main.ts` 业务流程

## 冻结契约（主 agent 已确认，你需要据此写文档和测试）

### A. response 兼容边界

- structured：只认 `info.structured`
- error：兼容 `info.error.data?.message`（优先）和 `info.error.message`（fallback）
- text：从 `parts` 中 `type === "text"` 提取，缺失返回 `null`

### B. `--json` 机器可读输出格式

```json
{
  "mode": "structured" | "text" | "error",
  "sessionId": "string | null",
  "result": {},
  "text": "string | null",
  "error": { "name": "string", "message": "string", "retries": "number" } | null
}
```

优先级：error > structured > text

### C. timeout

- `--timeout` = execution timeout（覆盖整个工作流程）
- `serverStartupTimeoutMs` 是内部字段，不暴露 CLI
- 无新增 CLI flag

### D. agent 校验

- `agents()` 可用 + agent 不存在 → 报错退出
- `agents()` 不可用 → warning + 继续
- 无 `--strict-agent`

---

## T6：README/help 全面对齐剩余行为

### T6-1. README 对齐 `--json` 输出格式

在 README 的"常用参数"或适当位置，明确说明 `--json` 模式的输出结构：

```markdown
### `--json` 输出格式

当使用 `--json --schema-file` 时，输出为统一 JSON 结构：

{
  "mode": "structured | text | error",
  "sessionId": "string | null",
  "result": {},
  "text": "string | null",
  "error": { "name": "string", "message": "string", "retries": "number" } | null
}

- `mode=structured`：结构化输出成功，数据在 `result`
- `mode=text`：纯文本模式，数据在 `text`
- `mode=error`：执行出错，错误信息在 `error`
```

同时确认 CLI help（`src/cli.ts:166`）文案：
- 当前：`Output structured JSON result (requires --schema-file)`
- 如果需要更准确可改为：`Output machine-readable JSON (requires --schema-file)`

### T6-2. README/help 对齐 timeout

在 README 中明确说明 `--timeout` 的语义：

```markdown
## 超时说明

- `--timeout <ms>`：执行超时，覆盖整个工作流程（从连接服务器到获取结果）。默认值为 [由 subagent-B 确认] 毫秒。
- 服务器启动超时为内部固定值，不暴露为 CLI 参数。
```

### T6-3. README/help 对齐 agent

确认 README 中关于 `--agent` 的描述准确：

- 当前（README:51）：`# 指定 agent 类型` — 需要补充说明这是预校验
- 建议改为：`# 指定 agent 类型（预校验，不传递给 SDK）`

并说明：
- 如果 agent API 不可用，会输出 warning 但继续执行
- 如果 agent 不存在于可用列表，会报错退出

### T6-4. README/help 对齐 keep-session

确认 README 中关于 `--keep-session` 的描述（README:48）：

```
# 保留 session 不删除
node --loader ts-node/esm run.ts --keep-session "任务"
```

补充说明：
- `--keep-session` 时，session 执行完不会被删除
- 但 abort 操作仍然会执行（确保 session 停止运行）
- 如果是 spawn 模式，server 仍然会被关闭

### T6-5. 更新环境变量说明

如果 `OPENCODE_TIMEOUT_MS` 语义变化（绑定 `executionTimeoutMs`），更新 README 的环境变量表格，说明它控制的是执行超时。

---

## T8：README 增加"已知限制"章节

在 README 末尾（退出码表格之后）增加：

```markdown
## 已知限制

1. **SDK 版本绑定**：当前适配 `@opencode-ai/sdk` 1.3.2，response 解析只兼容该锁定版本已明确可见的字段结构
2. **Structured output 依赖 schema**：`--json` 必须配合 `--schema-file` 使用，不支持无 schema 的 JSON 包装
3. **Agent 为预校验**：`--agent` 只在执行前校验 agent 是否存在，不传递给 SDK。agent API 不可用时无法确认 agent 状态
4. **Attach 优先策略**：默认先尝试 attach 已有 OpenCode 服务器，attach 失败后再 spawn 新实例
5. **Response 字段有限兼容**：只兼容 `info.structured`、`info.error.data?.message`、`info.error.message`，不兼容未列出的字段
6. **单 timeout 语义**：`--timeout` 控制整个工作流程的执行超时，服务器启动超时为内部固定值
```

---

## T7：补关键回归测试

所有测试使用 `node:test` + `assert/strict`，放在 `test/` 目录。

### T7-1. response 兼容测试（补充到 `test/response.test.ts`）

基于 subagent-A 的变更，补充以下测试用例：

```typescript
// extractErrorFromInfo: info.error.message 直接字段 fallback
it("extracts error.message as fallback when data.message is absent", () => {
  // 构造 info.error 有 message 但 data 为 undefined 的情况
});

// extractErrorFromInfo: data.message 优先于 error.message
it("prefers data.message over error.message when both present", () => {
  // 两者都有，应取 data.message
});

// extractErrorFromInfo: 两者都没有，message 为 undefined
it("returns undefined message when neither data.message nor error.message exists", () => {
});
```

### T7-2. `--json` 输出格式测试（补充到 `test/response.test.ts`）

```typescript
// formatJsonOutput: structured 成功
it("outputs mode=structured with result when structuredOutput present", () => {
  const output = JSON.parse(formatJsonOutput(normalized));
  assert.equal(output.mode, "structured");
  assert.equal(output.result.key, "value");
  assert.equal(output.text, null);
  assert.equal(output.error, null);
});

// formatJsonOutput: text 模式
it("outputs mode=text with text when only text parts present", () => {
  const output = JSON.parse(formatJsonOutput(normalized));
  assert.equal(output.mode, "text");
  assert.equal(output.text, "hello");
  assert.equal(output.result, null);
  assert.equal(output.error, null);
});

// formatJsonOutput: error 模式
it("outputs mode=error when error present", () => {
  const output = JSON.parse(formatJsonOutput(normalized));
  assert.equal(output.mode, "error");
  assert.ok(output.error);
});

// formatJsonOutput: error 优先于 structured
it("outputs mode=error even when both error and structuredOutput present", () => {
});

// formatJsonOutput: sessionId 透出
it("includes sessionId from info.sessionID", () => {
  const output = JSON.parse(formatJsonOutput(normalized));
  assert.equal(output.sessionId, "sess-1");
});

// formatJsonOutput: sessionId 为 null 当 info 缺失
it("returns null sessionId when info is null", () => {
});
```

### T7-3. keep-session 测试（补充到 `test/main.test.ts`）

```typescript
// 需要mock SDK，验证 --keep-session 时 deleteSession 不被调用
// 非 keep-session 时 deleteSession 被调用
```

> 注意：当前 `test/main.test.ts` 的集成测试依赖真实 SDK 连接（会 timeout），keep-session 测试需要 mock 或用足够长的 timeout。评估可行性后再决定是否实现。

### T7-4. timeout 测试（补充到 `test/main.test.ts` 或 `test/config.test.ts`）

如果 timeout 被拆分为 `executionTimeoutMs` + `serverStartupTimeoutMs`：

```typescript
// config.test.ts:
it("--timeout maps to executionTimeoutMs", () => {
  const config = createConfig({ timeoutMs: 60000 });
  assert.equal(config.executionTimeoutMs, 60000);
});

it("executionTimeoutMs has a sensible default", () => {
  const config = createConfig({});
  assert.ok(config.executionTimeoutMs > 0);
});

it("serverStartupTimeoutMs has internal default", () => {
  const config = createConfig({});
  assert.ok(config.serverStartupTimeoutMs > 0);
});
```

### T7-5. agent 策略测试（补充到 `test/opencode.test.ts`）

```typescript
// validateAgent: agents() 失败时输出 warning（通过 logger mock 验证）
it("logs warning when agents() API call fails", () => {
  // mock client.app.agents() 抛出非 AppError
  // 验证 logger.info 被调用，且文案包含 "WARNING" 或 "Could not verify"
});

// validateAgent: agent 不存在时报错（当前已有类似测试，确认覆盖）
it("throws CONFIG_INVALID when agent not found", () => {
});

// validateAgent: agent 存在时不报错（当前已有，确认覆盖）
it("does not throw when agent exists", () => {
});
```

---

## 实施顺序

1. **等 subagent-A 完成后**：写 T7-1（response 兼容测试）和 T7-2（JSON 输出测试）
2. **等 subagent-B 完成后**：写 T7-4（timeout 测试）和 T7-5（agent 测试）
3. **等 A/B 都完成后**：写 T6（README/help 对齐）和 T8（已知限制）
4. T7-3（keep-session 测试）评估可行性后决定

---

## 风险提示

1. **不要在代码行为冻结前写死文档和测试** — 等 A/B 的契约落地后再开工
2. **测试要断言字段契约，不只是"有输出"** — 比如 JSON 输出测试要验证 `mode` 值、`sessionId` 是否正确，而不是只验证 `JSON.parse` 不抛异常
3. **不要重写 `src/response.ts` 或 `src/config.ts` 的核心逻辑**

---

## 完成标准

- [ ] README/help/代码/测试四者口径一致
- [ ] `--json` 输出格式在 README 中有明确说明和示例
- [ ] timeout 语义在 README 中清晰说明
- [ ] agent 行为在 README 中准确描述
- [ ] "已知限制"章节已添加
- [ ] response 兼容测试覆盖 error fallback 路径
- [ ] JSON 输出测试覆盖 mode/sessionId/result/text/error
- [ ] timeout 配置测试覆盖新字段映射
- [ ] agent 策略测试覆盖 warning 路径
- [ ] `npm run typecheck && npm test` 全部通过

## 交付物

完成后向主 agent 提交：

1. README 变更摘要
2. 新增/修改测试用例清单
3. 剩余未覆盖风险列表
4. 手工回归建议命令
