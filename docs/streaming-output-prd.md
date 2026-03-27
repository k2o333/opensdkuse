# 流式输出功能 - 产品需求文档

## 1. 产品概述

**产品名称**: OpenSDKUse 流式输出增强

**一句话描述**: 为现有 CLI 工具添加 OpenCode SDK 流式响应输出能力，支持实时展示 AI 生成内容。

**目标用户**: 使用该 CLI 工具与 AI 模型交互的开发者。

**核心价值主张**: 提升用户体验，通过即时反馈减少等待焦虑；支持长时间生成任务的中途取消；与现有非流式模式向后兼容。

---

## 2. 需求分析

### 2.1 用户痛点

1. **等待焦虑**: 当前模式需等待完整响应生成后才显示结果，AI 生成耗时长时用户体验差
2. **无法中断**: 用户无法在生成过程中提前终止任务
3. **进度不透明**: 用户无法了解 AI 正在处理哪个阶段

### 2.2 功能需求

**Must Have**
- `--stream` CLI 标志启用流式输出
- 实时打印 AI 返回的文本片段
- 流式模式下支持 `Ctrl+C` 中断
- 流式与非流式模式输出结果一致性

**Should Have**
- 流式输出时显示简单的加载指示器（如光标闪烁）
- 流式模式下的错误处理

**Nice to Have**
- 显示 token 生成速度/进度
- 区分不同类型内容（代码块、文本等）的着色输出

### 2.3 非功能需求

- **向后兼容**: 默认行为保持不变（完整响应后输出）
- **性能**: 流式输出不应显著增加延迟
- **可恢复性**: 流式中断后能正确清理会话

---

## 3. 产品规划

### 3.1 MVP 版本范围

在现有代码基础上最小改动实现流式输出：

1. 添加 `--stream` CLI 参数
2. 修改 `executePrompt()` 支持流式响应处理
3. 添加流式输出的格式化展示
4. 处理流式模式下的中断信号

### 3.2 版本迭代计划

| 版本 | 内容 |
|------|------|
| v1.0 (MVP) | 基础流式输出 `--stream` 标志 |
| v1.1 | 加载指示器、进度显示 |
| v1.2 | 内容类型区分着色输出 |

### 3.3 关键里程碑

1. **M1**: 完成 SDK 流式 API 调研，确认实现方式
2. **M2**: CLI 参数解析支持 `--stream`
3. **M3**: 实现流式响应处理和输出
4. **M4**: 测试验证（流式/非流式一致性、中断处理）

---

## 4. 功能规格

### 4.1 功能模块划分

```
src/
├── cli.ts        # 添加 --stream 参数解析
├── opencode.ts   # 添加流式响应处理方法
├── response.ts   # 添加流式输出格式化
└── main.ts       # 流式/非流式分支逻辑
```

### 4.2 详细功能描述

#### 4.2.1 CLI 参数扩展 (`src/cli.ts`)

新增参数:
```
--stream        启用流式输出模式（默认关闭）
```

#### 4.2.2 流式响应处理 (`src/opencode.ts`)

新增方法:
```typescript
executePromptStream(
  sessionID: string,
  model: string,
  format: OutputFormat | undefined,
  parts: any[]
): AsyncGenerator<string, void, unknown>
```

SDK 层调研结论:
- SDK 支持 `parseAs: "stream"` 和 SSE 事件
- `session.prompt()` 返回 `AsyncGenerator` 可用于流式迭代
- 需要处理 `onSseEvent` 回调获取流式事件

#### 4.2.3 流式输出格式化 (`src/response.ts`)

```typescript
function formatStreamOutput(chunk: string): void
// 直接输出 chunk，不缓冲
```

#### 4.2.4 主流程改造 (`src/main.ts`)

```
executePrompt()
├── 非流式模式: 调用现有 executePrompt()，等待完整响应
└── 流式模式: 调用 executePromptStream()，迭代输出 chunks
```

### 4.3 用户故事

| ID | 用户故事 | 验收标准 |
|----|----------|----------|
| US-01 | 作为用户，我希望使用 `--stream` 标志实时看到 AI 生成的内容 | 启用 `--stream` 后内容逐段显示而非等待完成后统一显示 |
| US-02 | 作为用户，我可以在流式输出时按 `Ctrl+C` 中断任务 | 中断后会话正确清理，程序正常退出 |
| US-03 | 作为用户，我可以同时使用 `--stream` 和 `--json` | JSON 模式下流式输出 JSON 内容 |
| US-04 | 作为用户，不加 `--stream` 时行为与现在完全一致 | 现有工作流无任何变化 |

### 4.4 流程图

```
main()
  └─> parseArgs()
        └─> createConfig()
              └─> connectOrStartServer()
                    └─> createSession()
                          └─> injectPromptTemplate()
                                └─> executePrompt()
                                      ├─> 非流式: 等待完整响应 -> formatTextOutput() / formatJsonOutput()
                                      └─> 流式: for each chunk -> formatStreamOutput()
                                            └─> (可选) abortSession() on Ctrl+C
```

---

## 5. 技术规划

### 5.1 技术栈建议

- **运行时**: Node.js (已有)
- **SDK**: `@opencode-ai/sdk@1.3.2` (已有)
- **依赖变更**: 无新增外部依赖

### 5.2 系统架构概述

```
┌─────────────────────────────────────────────────────┐
│                      CLI                             │
├─────────────────────────────────────────────────────┤
│  cli.ts  │  config.ts  │  main.ts  │  opencode.ts  │
├─────────────────────────────────────────────────────┤
│                   @opencode-ai/sdk                  │
│              (流式支持 via parseAs:"stream")          │
└─────────────────────────────────────────────────────┘
```

### 5.3 数据模型设计

无需新增数据模型变更。

**Config 扩展**:
```typescript
interface AppConfig {
  // ... 现有字段
  stream: boolean;  // 新增: 是否启用流式输出
}
```

### 5.4 API 设计

无需对外暴露新 API，仅内部改动。

**SDK 层调用示意**:
```typescript
// 非流式 (现有)
const response = await client.session.prompt({ sessionID, model, format, parts });

// 流式 (新增)
// SDK 返回 AsyncGenerator，需迭代处理
for await (const chunk of client.session.prompt({ sessionID, model, format, parts })) {
  formatStreamOutput(chunk);
}
```

---

## 6. 项目计划

### 6.1 任务分解

| 任务 | 描述 | 预估工时 | 依赖 |
|------|------|----------|------|
| T-01 | 调研 SDK 流式 API 细节 | 2h | - |
| T-02 | 添加 `--stream` CLI 参数 | 1h | - |
| T-03 | 实现 `executePromptStream()` | 3h | T-01 |
| T-04 | 添加 `formatStreamOutput()` | 1h | - |
| T-05 | 修改 `main.ts` 集成流式逻辑 | 2h | T-02, T-03, T-04 |
| T-06 | 添加流式中断处理 (Ctrl+C) | 2h | T-05 |
| T-07 | 单元测试更新 | 2h | T-01~T-06 |
| T-08 | 手动验证测试 | 1h | T-07 |

**总预估工时**: 约 14 小时

### 6.2 时间估算

假设团队规模 1 人，按优先级顺序执行:

- 第一天: T-01 ~ T-04 (调研 + 核心实现)
- 第二天: T-05 ~ T-06 (集成 + 中断处理)
- 第三天: T-07 ~ T-08 (测试 + 验证)

### 6.3 风险分析

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| SDK 流式 API 与调研不符 | 中 | 预留 T-01 重做时间，提前与 SDK 源码对照 |
| 流式输出与 JSON 模式冲突 | 低 | JSON 流式输出可分块 JSON 或延迟组装 |
| Ctrl+C 中断时会话清理不完全 | 中 | 显式调用 `abortSession()` + `deleteSession()` |
| 现有测试回归失败 | 低 | 按 AGENTS.md 规范运行 `npm test` |

---

## 附录

### A. 相关文件路径

| 文件 | 作用 | 改动预估 |
|------|------|----------|
| `src/cli.ts` | CLI 参数解析 | +5 行 |
| `src/opencode.ts` | SDK 适配层 | +30 行 |
| `src/response.ts` | 输出格式化 | +15 行 |
| `src/main.ts` | 主流程编排 | +20 行 |
| `src/config.ts` | 配置管理 | +3 行 |

### B. 参考资料

- `@opencode-ai/sdk` v1.3.2 类型定义 (`node_modules/@opencode-ai/sdk`)
- 现有 `executePrompt()` 实现 (`src/opencode.ts`)
- 现有响应格式化逻辑 (`src/response.ts`)
