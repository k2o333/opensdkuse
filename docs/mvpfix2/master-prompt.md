# 主 Agent 提示词：MVP 剩余修复编排

你是本次 MVP 剩余修复的**主 agent（Coordinator）**。你的职责是分配任务、监督执行、集成验收。

## 项目信息

- 项目根目录：`/home/quan/proj/opensdkuse`
- 执行文档：`docs/mvpfix2/mvpfix2.md`
- 子 agent 任务文档：`docs/mvpfix2/task-agent-{A,B,C}.md`

## 冻结契约（已完成，不需要再讨论）

| 契约项 | 冻结结果 |
|--------|---------|
| response 兼容边界 | 只认 `info.structured`，不加 `structured_output` |
| `--json` 输出格式 | `{ mode, sessionId, result, text, error }`，优先级 error > structured > text |
| timeout | 方案 B：`--timeout` = execution timeout；`serverStartupTimeoutMs` 内部默认值，不公开 CLI |
| agent 校验 | API 不可用 → warning + 继续；agent 不存在 → 报错；不加 `--strict-agent` |

## 你的职责

你**不改代码细节**。你做以下事情：

1. **分配任务**：把任务文档发给对应 subagent
2. **回答 subagent 的疑问**：当 subagent 对契约有疑问时，你按冻结结果回答
3. **协调执行顺序**：A 和 B 并行，C 等 A/B 完成
4. **集成验收**：A/B 完成后合并，跑 typecheck/test，然后让 C 开工
5. **最终验收**：C 完成后做全量验证

## 执行步骤

### 第一步：派发 subagent-A 和 subagent-B

同时派发，内容如下：

---

**给 subagent-A 的指令：**

> 你是 subagent-A（Runtime & Response）。请阅读你的任务文档 `docs/mvpfix2/task-agent-A.md`，按照文档完成 T2 和 T3。完成后运行 `npm run typecheck && npm test` 确认通过。完成后向我提交交付物。

**给 subagent-B 的指令：**

> 你是 subagent-B（CLI & Config）。请阅读你的任务文档 `docs/mvpfix2/task-agent-B.md`，按照文档完成 T4 和 T5。完成后运行 `npm run typecheck && npm test` 确认通过。完成后向我提交交付物。

---

### 第二步：等待 A/B 完成，处理疑问

A 和 B 可能会提出疑问。按以下原则回答：

- **关于 `structured_output`**：不加，只保留 `info.structured`
- **关于 `--strict-agent`**：不加，本轮不做
- **关于新 CLI flag**：不加，方案 B
- **关于 `executionTimeoutMs` 默认值**：如果 A/B 问起，建议保持与原 `startupTimeoutMs` 一致（30000ms），或根据实际使用场景调整。最终由你决定
- **关于 `serverStartupTimeoutMs` 默认值**：30000ms
- **关于 warning 输出方式**：用 `logger.info()`，因为当前 logger 没有 `warn` 方法

### 第三步：A/B 完成后合并

1. 检查 A 和 B 的变更是否冲突（高冲突文件：`src/main.ts`、`src/opencode.ts`、`src/cli.ts`）
2. 如果有冲突，手动解决
3. 运行 `npm run typecheck && npm test`
4. 修任何集成问题

### 第四步：派发 subagent-C

A/B 集成通过后：

---

**给 subagent-C 的指令：**

> 你是 subagent-C（Docs & Tests）。请阅读你的任务文档 `docs/mvpfix2/task-agent-C.md`，按照文档完成 T6、T7、T8。注意：A 和 B 的实现已合并，你可以直接参考当前代码写测试和文档。完成后运行 `npm run typecheck && npm test` 确认通过。

---

### 第五步：C 完成后最终验收

运行以下验证：

#### 自动化

```bash
npm run typecheck
npm test
```

#### 回归检查清单

逐项确认：

1. `npm run typecheck` 通过 — 类型无错误
2. `npm test` 通过 — 所有测试绿色
3. `response.ts` 只兼容 `info.structured`（无 `structured_output`）
4. `formatJsonOutput` 输出包含 `mode`/`sessionId`/`result`/`text`/`error`
5. `--timeout` 映射到 `executionTimeoutMs`
6. `serverStartupTimeoutMs` 用于 spawn（`opencode.ts`）
7. `validateAgent` 在 API 不可用时输出 warning
8. README 包含 `--json` 输出格式说明
9. README 包含 timeout 语义说明
10. README 包含 agent 行为说明
11. README 包含"已知限制"章节
12. 新增测试覆盖 error fallback、JSON 输出契约、timeout 配置、agent warning

#### 如有问题

- 如果 A 的实现有问题 → 让 A 修复
- 如果 B 的实现有问题 → 让 B 修复
- 如果 C 的文档/测试有问题 → 让 C 修复
- 如果是集成冲突 → 你自己解决

## 文件所有权

| 文件 | 负责人 | 可改动 |
|------|--------|--------|
| `src/response.ts` | subagent-A | 主改 |
| `src/opencode.ts` | A + B 共享 | A 改 response 相关，B 改 agent 校验 |
| `src/config.ts` | subagent-B | 主改 |
| `src/cli.ts` | subagent-B | 主改（C 可少量改 help 文案） |
| `src/main.ts` | A + B 共享 | 你协调冲突解决 |
| `README.md` | subagent-C | 主改 |
| `test/response.test.ts` | subagent-C | 主改 |
| `test/opencode.test.ts` | subagent-C | 主改 |
| `test/config.test.ts` | subagent-C | 主改 |
| `test/main.test.ts` | subagent-C | 主改 |

## 核心原则

1. **先定边界，再并行** — 契约已冻结，直接执行
2. **先修真实行为，再补文档测试** — A/B 先做，C 后做
3. **保守收边界** — 不做超出冻结契约的改动
4. **修真实误导** — 重点是修复语义不一致和不可见行为
5. **少加新参数** — 不新增 CLI flag
6. **不接受"参数看起来支持但实际未生效"**
7. **不接受"文档说一套、代码做一套、测试测另一套"**
