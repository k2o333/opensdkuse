# subagent-B 任务文档：CLI & Config

## 你的角色

你是 **subagent-B**，负责 CLI 参数语义、配置层和 agent 校验策略。
任务文档在 `docs/mvpfix2/task-agent-B.md`，请完整阅读后再动手。

## 代码库信息

- 项目根目录：`/home/quan/proj/opensdkuse`
- 你的主战场：`src/config.ts`、`src/cli.ts`、`src/main.ts`、`src/opencode.ts`（少量）
- 你可以建议测试，但不自己写测试文件

## 禁区（不要主动修改）

- `src/response.ts`
- `README.md` 大段正文（交给 subagent-C）
- `test/*.test.ts`

## 冻结契约（主 agent 已确认，你只需执行）

### A. timeout 方案（方案 B）

- `--timeout` 语义明确定义为 **execution timeout**
- 配置字段重命名：`startupTimeoutMs` → `executionTimeoutMs`
- 新增内部字段：`serverStartupTimeoutMs`（固定默认值，不暴露 CLI）
- `--timeout` CLI 参数和环境变量 `OPENCODE_TIMEOUT_MS` 绑定 `executionTimeoutMs`
- **不加** `--server-startup-timeout` 和 `--execution-timeout` 新 CLI flag
- `serverStartupTimeoutMs` 默认值建议 `30000`（与当前 `startupTimeoutMs` 一致）

### B. agent 校验策略

- `agents()` API 调用成功但 agent 不存在 → **报错退出**（当前行为，保持）
- `agents()` API 调用失败 → **输出 warning 并继续**（当前是 debug 级别，需改为 warning）
- **不加** `--strict-agent` CLI flag

---

## T4：拆分 timeout 语义

### 当前问题

1. `src/config.ts:9`：配置字段叫 `startupTimeoutMs`，但实际控制的是整个流程超时
2. `src/main.ts:105-113`：这个 timer 从 `connectOrStartServer` 之前就开始跑，覆盖 attach/spawn 到 cleanup 之前的整个生命周期
3. `src/cli.ts:169`：help 文案写的是 "Execution timeout in milliseconds"，但字段名是 `startupTimeoutMs`，语义矛盾
4. `README.md:42`：写的是 "设置超时（毫秒）"，没说明是哪类超时

### T4-1. 修改 config.ts

**改动 `src/config.ts`**：

1. `AppConfig` 接口增加 `executionTimeoutMs` 字段，将 `startupTimeoutMs` 保留为 server startup 专用：

```typescript
export interface AppConfig {
  model: string;
  hostname: string;
  port: number;
  promptFile: string;
  sessionTitle: string;
  serverStartupTimeoutMs: number;   // 服务器启动超时（内部默认值）
  executionTimeoutMs: number;       // 执行超时（用户可见，默认 2700000ms = 45分钟）
  maxInputLength: number;
}
```

2. DEFAULTS 更新：

```typescript
const DEFAULTS: AppConfig = {
  // ...其他不变
  serverStartupTimeoutMs: 30000,   // 内部默认，不暴露
  executionTimeoutMs: 2700000,     // 用户可见默认值（45分钟）
  // ...
};
```

> `executionTimeoutMs` 默认值为 **2700000ms（45分钟）**，给 AI 执行任务留足时间。`serverStartupTimeoutMs` 保持 30000ms。

3. `createConfig` 中 CLI 映射：

```typescript
// --timeout 和 OPENCODE_TIMEOUT_MS 绑定 executionTimeoutMs
if (cliArgs?.timeoutMs !== undefined) config.executionTimeoutMs = cliArgs.timeoutMs;
```

删除旧的 `config.startupTimeoutMs = cliArgs.timeoutMs` 映射。

**注意**：你需要同时调整 `CliArgs` 接口中的字段名吗？不需要。`CliArgs.timeoutMs` 是 CLI 层的原始输入名，保持不变。映射关系在 `createConfig` 中定义。

### T4-2. 修改 main.ts 中 timeout 使用

**改动 `src/main.ts:104-113`**：

将 timeout timer 改为使用 `config.executionTimeoutMs`：

```typescript
if (config.executionTimeoutMs > 0) {
  timeoutTimer = setTimeout(() => {
    if (!interrupted) {
      interrupted = true;
      mainError = new AppError("TIMEOUT", `Execution timed out after ${config.executionTimeoutMs}ms`);
      abortController.abort();
    }
  }, config.executionTimeoutMs);
}
```

同时更新错误消息，确保语义清晰。

### T4-3. 修改 cli.ts help 文案

**改动 `src/cli.ts:169`**：

```
  --timeout <ms>       Execution timeout in milliseconds
```

保持不变（文案本身已经正确），但如果你觉得需要更明确，可以改为：

```
  --timeout <ms>       Execution timeout in milliseconds (covers the entire workflow)
```

### T4-4. 确保 serverStartupTimeoutMs 被消费

检查 `connectOrStartServer`（`src/opencode.ts:95-100`）：

```typescript
const result = await sdk.createOpencode({
  hostname: config.hostname,
  port: config.port,
  timeout: config.startupTimeoutMs,  // 这里需要改为 config.serverStartupTimeoutMs
  signal: deps?.signal,
});
```

**改动**：将 `config.startupTimeoutMs` 改为 `config.serverStartupTimeoutMs`。

这是 `serverStartupTimeoutMs` 的唯一消费点。注意 `connectOrStartServer` 的 timeout 只用于 spawn，attach 走 health check 没有 timeout。

---

## T5：agent 校验失败改为可见策略

### 当前问题

`src/opencode.ts:108-129` 中 `validateAgent` 函数：
- `agents()` 成功且 agent 不存在 → 抛 `AppError`（正确，保持）
- `agents()` 调用失败 → 只记 debug 日志继续（**问题：用户不可见**）

### T5-1. 将 agent API 不可用时的 debug 改为 warning

**改动 `src/opencode.ts:125-128`**：

```typescript
// 当前：
} catch (err: any) {
  if (err instanceof AppError) throw err;
  logger?.debug(`Agent validation skipped (agents() failed): ${err?.message || err}`);
}

// 改为：
} catch (err: any) {
  if (err instanceof AppError) throw err;
  logger?.info(`WARNING: Could not verify agent "${agentName}" (agents() API unavailable). Proceeding without agent confirmation.`);
}
```

**要求**：
- 使用 `logger.info` 输出 warning（因为当前 logger 没有 `warn` 方法，`info` 输出到 stderr 带 `[INFO]` 前缀，足以引起注意）
- warning 文案必须清楚表达"未能验证"，而不是"验证通过"
- 不能暗示 agent 已生效

### T5-2. 不加 --strict-agent

本轮不加 `--strict-agent` flag。当前行为已足够：
- API 可用 + agent 不存在 → 报错
- API 不可用 → warning + 继续

### T5-3. 确保 cli.ts help 文案不误导

**检查 `src/cli.ts:168`**：

```
  --agent <name>      Validate agent exists (pre-check only, not passed to SDK)
```

当前文案已经正确说明是 "pre-check only"。确认保持不变。

如果 subagent-C 要更新 README 中关于 agent 的说明，需要你提供的信息（见交付物第 4 点）。

---

## 风险提示

1. **`executionTimeoutMs` 默认值选择**：如果从 30000 改成更大的值（如 300000），会影响没有显式设置 `--timeout` 的用户。建议和主 agent 确认默认值。
2. **不要引入新 CLI flag** — 已明确冻结方案 B
3. **不要引入 `--strict-agent`** — 已明确冻结
4. **不要动 `src/response.ts`**

---

## 完成标准

- [ ] `AppConfig` 包含 `serverStartupTimeoutMs` 和 `executionTimeoutMs` 两个字段
- [ ] `--timeout` 和 `OPENCODE_TIMEOUT_MS` 映射到 `executionTimeoutMs`
- [ ] `serverStartupTimeoutMs` 用于 `connectOrStartServer` 的 spawn timeout
- [ ] `main.ts` 的 timeout timer 使用 `executionTimeoutMs`
- [ ] `opencode.ts` 中 agent 验证失败时输出 warning（不是 debug）
- [ ] warning 文案清楚表达"未能验证"
- [ ] CLI help 文案不暗示 agent 一定已生效
- [ ] `npm run typecheck && npm test` 全部通过

## 交付物

完成后向主 agent 提交：

1. 新旧 CLI 参数映射对照表
2. timeout 消费点流程图（startup vs execution）
3. agent warning/error 文案列表
4. README/help 需要同步更新的要点清单（交给 subagent-C）
