下面是一版 **MVP 技术设计文档（TDD）**，与上一版 PRD 对齐，并把实现层面的关键决策写清楚。文中凡涉及 OpenCode SDK 与 ts-node 的具体行为，均以官方文档为依据：OpenCode SDK 支持 `createOpencode()`、`createOpencodeClient()`、`client.global.health()`、`client.app.agents()`、`session.create()`、`session.prompt()`、`session.abort()`、`session.delete()` 等接口；`session.prompt()` 支持 `noReply: true` 仅注入上下文；结构化输出支持 JSON Schema；ts-node 是直接执行 TypeScript 的运行时，推荐本地安装并通常配合 `@types/node`、`tslib` 使用。 ([OpenCode][1])

---

# MVP 技术设计文档（TDD）

## 项目：基于 ts-node 的 OpenCode SDK CLI 工具

## 1. 设计目标

本 TDD 对应的实现目标是：构建一个基于 TypeScript + ts-node 的 CLI 工具，能够读取本地 prompt 模板，连接或启动 OpenCode 服务，创建会话，注入上下文，执行任务，支持文本或结构化输出，并在超时、中断和错误场景下完成资源清理。OpenCode SDK 已提供会话、健康检查、代理枚举、结构化输出和会话中止这些实现基础。 ([OpenCode][1])

本 TDD 只覆盖 MVP。多代理协作在本版本中作为“受提示词驱动的可验证能力目标”，而不是对 SDK 原生 subagent 编排能力的强承诺。原因是当前可明确确认的接口是 session、agents、abort、structured output 等；对于“稳定的原生子任务编排契约”，本文档不直接假设其已对当前 SDK 版本稳定暴露。 ([OpenCode][1])

---

## 2. 总体架构

系统采用分层设计：

* CLI 层：参数解析、help、输入校验
* 配置层：环境变量、默认值、CLI 覆盖
* Prompt 层：模板读取、模板注入、任务拼装
* SDK 适配层：attach/spawn、health、session 生命周期、abort、structured output
* 响应层：统一解析 `parts`、structured output、错误对象
* 编排层：串联整体流程，负责 try/finally 与退出码

这样设计的目的是把与 OpenCode SDK 强耦合的逻辑集中在一个适配层中，避免业务代码到处散落对 `.data`、`parts`、`structured_output` 等字段的访问。由于 SDK 客户端支持不同 `responseStyle`，且结构化输出会写入结果对象中，集中归一化可以降低未来升级成本。 ([OpenCode][1])

---

## 3. 目录结构与职责

```text
apps/opencode/
├─ prompt.md
├─ package.json
├─ tsconfig.json
├─ run.ts
├─ src/
│  ├─ cli.ts
│  ├─ config.ts
│  ├─ logger.ts
│  ├─ prompt.ts
│  ├─ response.ts
│  ├─ opencode.ts
│  └─ main.ts
└─ test/
   ├─ cli.test.ts
   ├─ prompt.test.ts
   ├─ response.test.ts
   └─ opencode.test.ts
```

保留 `run.ts` 与 `src/main.ts` 两个入口文件，但边界必须清晰：`run.ts` 只处理 shebang、顶层异常、`process.exitCode`；`main.ts` 只负责编排。这个拆分不是功能冗余，而是为了把 CLI 进程行为与业务流程隔离。这个判断属于工程设计，不依赖 SDK 事实。

---

## 4. 运行模式设计

### 4.1 attach 模式

优先尝试连接已有 OpenCode 服务：

1. `createOpencodeClient({ baseUrl, ... })`
2. `client.global.health()`
3. 探活成功后进入会话流程

之所以必须调用 `global.health()`，是因为创建 client 对象本身不等于连接成功；官方将健康检查单独作为 `global.health()` 暴露出来。 ([OpenCode][1])

### 4.2 spawn 模式

attach 失败时自动降级：

1. `createOpencode({ hostname, port, timeout, signal, config })`
2. 获取 `client` 和 `server`
3. 使用该 `client` 继续执行
4. 仅当当前进程启动了 server，才在结束时关闭它

官方文档说明 `createOpencode()` 会同时启动 server 和 client，并允许传入 `hostname`、`port`、`timeout`、`signal` 与配置对象，因此这一路径可直接落地。 ([OpenCode][1])

### 4.3 模式选择策略

默认策略：

* 先 attach
* attach 或 health 失败后 spawn
* spawn 失败则整体失败退出

该策略保证本工具既能复用现有 OpenCode 实例，也能独立运行。

---

## 5. 会话模型设计

OpenCode SDK 已提供 `session.create()`、`session.delete()`、`session.list()`、`session.get()`、`session.messages()`、`session.message()`、`session.prompt()`、`session.abort()` 等接口，因此本工具将所有任务都绑定到单个 session 上完成。 ([OpenCode][1])

### 5.1 SessionConfig

```ts
export interface SessionConfig {
  title: string
  agent?: string
  model?: string
  permissions?: unknown
}
```

说明：

* `title`：会话标题，供 list/get 识别
* `agent`：用于选择代理类型；可先通过 `client.app.agents()` 做存在性校验
* `model`：用于覆盖默认模型
* `permissions`：MVP 先作为预留字段，真正 schema 以集成时实际 SDK 类型为准

`app.agents()` 是官方公开接口，可用于获取可用代理列表。 ([OpenCode][1])

### 5.2 会话生命周期

标准顺序：

1. create session
2. 注入模板
3. 发送用户任务
4. 解析响应
5. 输出结果
6. 依据 `--keep-session` 决定是否 delete
7. 如为 spawn 模式则 close server

### 5.3 keep-session 设计

默认删除 session，只有当显式传入 `--keep-session` 时才保留。这是产品策略，不是 SDK 限制；之所以默认删除，是为了避免 CLI 临时执行造成 session 堆积。SDK 方面已经支持列出、获取和删除会话。 ([OpenCode][1])

---

## 6. Prompt 注入设计

### 6.1 采用两段式注入

第一阶段：注入模板

```ts
await client.session.prompt({
  path: { id: sessionId },
  body: {
    noReply: true,
    parts: [{ type: "text", text: promptTemplate }]
  }
})
```

第二阶段：发送任务

```ts
await client.session.prompt({
  path: { id: sessionId },
  body: {
    model,
    parts: [{ type: "text", text: userTask }]
  }
})
```

OpenCode 官方文档明确说明：`session.prompt()` 在 `body.noReply: true` 时返回 UserMessage，仅注入上下文；默认情况下返回带有 AI 响应的 AssistantMessage。这个接口特性正好适合把模板上下文和用户任务分开处理。 ([OpenCode][1])

### 6.2 为什么不用“纯字符串拼接”

虽然把模板和任务直接拼接成一个大字符串也能工作，但两段式注入有三个好处：

* 逻辑更清晰：模板是规则，任务是输入
* 更利于未来 session 复用
* 更贴近 SDK 已有语义

### 6.3 Prompt 文件规则

`prompt.md` 仅作为纯文本模板读取，不做代码执行，不做变量求值。MVP 只要求：

* UTF-8 可读
* 内容非空
* 长度在限制范围内

---

## 7. 响应模型与归一化设计

SDK 的会话消息与 prompt 结果都围绕 `info + parts` 结构展开，结构化输出则写在结果对象中，因此必须建立统一的响应适配层。文档还说明客户端支持 `responseStyle: "data" | "fields"`，这进一步要求业务层不要直接假设返回结构。 ([OpenCode][1])

### 7.1 归一化目标

`response.ts` 输出统一结构：

```ts
export interface NormalizedResponse {
  raw: unknown
  info: unknown | null
  parts: Array<unknown>
  text: string | null
  otherParts: Array<unknown>
  structuredOutput: unknown | null
  error: { name?: string; message?: string; retries?: number } | null
}
```

### 7.2 归一化流程

1. 识别 SDK 返回的根对象
2. 提取 `info`
3. 提取 `parts`
4. 聚合 `type === "text"` 的文本
5. 提取非文本 parts
6. 提取 structured output
7. 提取错误对象

### 7.3 输出策略

* 默认：优先输出 `text`
* `--json`：优先输出 `structuredOutput`
* `--debug`：追加打印 `otherParts` 摘要与关键信息
* 无文本且无结构化结果：输出明确错误

### 7.4 关于 structured output 字段

官方示例展示了通过 JSON Schema 请求结构化输出，并从 `result.data.info.structured_output` 读取结果。实现时应把该字段访问封装在 `response.ts` 里，不在其他模块直接依赖路径。 ([OpenCode][1])

---

## 8. 结构化输出设计

### 8.1 功能目标

支持 `--json` 模式，要求模型返回符合 JSON Schema 的结构化对象。

### 8.2 接口调用

根据官方文档，结构化输出通过在 prompt body 中指定 JSON Schema 格式来请求；文档同时展示了 `format`/结构化输出能力，并说明模型会借助 StructuredOutput 工具返回已验证的 JSON。实现层要以当前安装 SDK 的类型定义为准，并将差异封装进适配层。 ([OpenCode][1])

示例适配接口：

```ts
export interface StructuredOutputOptions {
  schema: Record<string, unknown>
  retryCount?: number
}
```

### 8.3 错误处理

官方文档说明：若模型在所有重试后仍无法生成符合 schema 的结果，会返回 `StructuredOutputError`，其中包含错误信息和重试次数。MVP 必须显式识别并输出这类错误，不允许静默失败。 ([OpenCode][1])

---

## 9. CLI 设计

### 9.1 支持参数

```ts
export interface CliArgs {
  showHelp: boolean
  debug: boolean
  info: boolean
  keepSession: boolean
  json: boolean
  model?: string
  host?: string
  port?: number
  promptFile?: string
  timeoutMs?: number
  agent?: string
  userInput: string
}
```

### 9.2 参数规则

* 支持 `--help` / `-h`
* 支持 `--` 终止符
* 未知参数直接报错
* `--json` 要求提供 schema 来源或使用内置 schema
* `--keep-session` 仅改变清理行为，不影响执行流程

### 9.3 帮助输出

help 文案必须包含：

* 命令示例
* 环境变量
* 配置优先级
* 默认行为说明

---

## 10. 配置设计

### 10.1 AppConfig

```ts
export interface AppConfig {
  model: string
  hostname: string
  port: number
  promptFile: string
  sessionTitle: string
  startupTimeoutMs: number
  maxInputLength: number
}
```

### 10.2 配置优先级

优先级固定为：

1. CLI 参数
2. 环境变量
3. 默认值

冲突时始终以 CLI 为准，不报错。这个是本工具自己的配置决策。OpenCode 自身的配置文件是 JSON/JSONC 且按位置合并，项目配置可覆盖更上层配置；本工具只在 CLI 层再加一层更直接的覆盖策略。 ([OpenCode][2])

### 10.3 推荐环境变量

* `OPENCODE_MODEL`
* `OPENCODE_HOST`
* `OPENCODE_PORT`
* `OPENCODE_PROMPT`
* `OPENCODE_TIMEOUT_MS`
* `OPENCODE_MAX_INPUT_LENGTH`

---

## 11. 错误处理设计

系统采用“模块内抛错、入口统一兜底”的原则。任何深层模块都不允许直接 `process.exit()`。

### 11.1 错误类型

```ts
export type AppErrorCode =
  | "INPUT_INVALID"
  | "PROMPT_FILE_NOT_FOUND"
  | "PROMPT_FILE_EMPTY"
  | "PROMPT_FILE_DECODE_FAILED"
  | "CONFIG_INVALID"
  | "ATTACH_FAILED"
  | "HEALTHCHECK_FAILED"
  | "SPAWN_FAILED"
  | "SESSION_CREATE_FAILED"
  | "SESSION_PROMPT_FAILED"
  | "SESSION_ABORT_FAILED"
  | "SESSION_DELETE_FAILED"
  | "STRUCTURED_OUTPUT_FAILED"
  | "TIMEOUT"
  | "INTERRUPTED"
```

```ts
export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public cause?: unknown
  ) {
    super(message)
  }
}
```

### 11.2 错误映射

* 文件不存在 → `PROMPT_FILE_NOT_FOUND`
* UTF-8 解码失败 → `PROMPT_FILE_DECODE_FAILED`
* health 失败 → `HEALTHCHECK_FAILED`
* spawn 超时 → `SPAWN_FAILED`
* StructuredOutputError → `STRUCTURED_OUTPUT_FAILED`
* Ctrl+C → `INTERRUPTED`

### 11.3 错误输出策略

* 默认模式：输出一行主错误 + 一行建议
* debug 模式：附加 stack 与 cause 摘要

---

## 12. 超时、取消与清理设计

### 12.1 设计原则

只要 session 已创建，就必须尽量清理；只要 server 是本进程启动的，就必须尽量关闭。

### 12.2 超时实现

实现方式：

* CLI 接收 `--timeout`
* `main.ts` 内建立 `AbortController`
* 启动超时计时器
* 超时触发后：

  * 调用 `session.abort()`
  * 抛出 `TIMEOUT`
  * 继续走 finally 清理

OpenCode 文档说明 `createOpencode()` 支持 `signal` 和 `timeout`；文档也提供了 `session.abort()`，因此启动超时与执行中止都可实现。 ([OpenCode][1])

### 12.3 信号处理

监听 `SIGINT` / `SIGTERM`：

1. 标记为中断态
2. 若 session 已存在，调用 `session.abort()`
3. 删除 session（除非保留策略另有要求）
4. 若为 spawn 模式，关闭 server
5. 退出码设为非零

### 12.4 清理顺序

固定顺序：

1. abort session（如果仍在运行）
2. delete session（如果未 keep）
3. close server（如果为 spawn 模式）

### 12.5 清理失败策略

* 清理错误只记录，不覆盖主错误
* finally 内的任何异常都应被吞并为日志

---

## 13. 日志设计

### 13.1 Logger 接口

```ts
export interface Logger {
  log(...args: unknown[]): void
  info(...args: unknown[]): void
  debug(...args: unknown[]): void
  error(...args: unknown[]): void
  separator(char?: string, count?: number): void
}
```

### 13.2 日志级别

* 默认：`info`
* `--debug`：开启 `debug`
* 错误始终输出

### 13.3 必须记录的事件

* 读取配置完成
* attach 尝试开始/成功/失败
* spawn 开始/成功/失败
* session 创建成功
* 模板注入开始
* 任务发送开始
* structured output 模式是否开启
* abort/cleanup 执行情况

---

## 14. 模块接口设计

## 14.1 `cli.ts`

```ts
export function parseArgs(argv: string[]): CliArgs
export function validateInput(input: string, maxLength: number): void
export function showHelp(config: AppConfig): string
```

## 14.2 `config.ts`

```ts
export function createConfig(cliArgs?: Partial<CliArgs>): AppConfig
export function getServerUrl(config: AppConfig): string
```

## 14.3 `prompt.ts`

```ts
export function loadPromptTemplate(path: string): string
export function buildUserTask(input: string): string
export function validatePromptTemplate(content: string, maxLength: number): void
```

## 14.4 `response.ts`

```ts
export function normalizeSdkResponse(result: unknown): NormalizedResponse
export function extractText(parts: unknown[]): string | null
export function extractStructuredOutput(result: unknown): unknown | null
```

## 14.5 `opencode.ts`

```ts
export interface RuntimeHandle {
  client: unknown
  server: { close?: () => Promise<void> | void } | null
  mode: "attach" | "spawn"
}

export async function connectOrStartServer(
  config: AppConfig,
  deps?: { logger?: Logger; signal?: AbortSignal }
): Promise<RuntimeHandle>

export async function createSession(
  client: unknown,
  sessionConfig: SessionConfig
): Promise<{ id: string }>

export async function injectPromptTemplate(
  client: unknown,
  sessionId: string,
  text: string
): Promise<void>

export async function executePrompt(
  client: unknown,
  sessionId: string,
  task: string,
  opts?: { model?: string; structured?: StructuredOutputOptions }
): Promise<unknown>

export async function abortSession(client: unknown, sessionId: string): Promise<void>
export async function deleteSession(client: unknown, sessionId: string): Promise<void>
export async function closeServer(server: RuntimeHandle["server"]): Promise<void>
```

## 14.6 `main.ts`

```ts
export async function main(argv?: string[]): Promise<number>
```

---

## 15. 核心时序设计

### 15.1 正常执行时序

```text
run.ts
  -> main.ts
    -> parseArgs()
    -> createConfig()
    -> validateInput()
    -> loadPromptTemplate()
    -> connectOrStartServer()
       -> attach via createOpencodeClient()
       -> health()
       -> or spawn via createOpencode()
    -> createSession()
    -> injectPromptTemplate(noReply=true)
    -> executePrompt()
    -> normalizeSdkResponse()
    -> print result
    -> finally:
         deleteSession() [unless keep]
         closeServer()   [if spawn]
```

### 15.2 Ctrl+C 时序

```text
SIGINT
  -> mark interrupted
  -> abortSession()
  -> deleteSession() [unless keep strategy overrides]
  -> closeServer()   [if spawn]
  -> exit code = 130 or non-zero
```

### 15.3 超时时序

```text
timeout reached
  -> abort controller fires / timeout callback
  -> abortSession()
  -> throw TIMEOUT
  -> finally cleanup
```

---

## 16. 多代理协作的技术落点

MVP 在技术上只做两件事：

1. 允许通过 `prompt.md` 描述主代理职责、分工规则、子任务边界
2. 允许通过 `--agent` 选择代理类型，并先用 `app.agents()` 校验目标 agent 是否可用

真正的“原生子代理/task 编排”不写进 MVP 的硬实现承诺。技术上要为这件事预留两个扩展点：

* `prompt.ts`：允许模板演进为多角色规则模板
* `opencode.ts`：允许未来新增原生 task/subsession 调用适配

这样做的原因是当前 SDK 文档能确认 `app.agents()`，但本文档不把未确认的原生 subagent contract 当作已知稳定事实。 ([OpenCode][1])

---

## 17. 测试设计

### 17.1 单元测试

`cli.test.ts`

* 解析 `--debug`
* 解析 `--`
* 未知参数报错
* 空输入报错

`prompt.test.ts`

* 文件不存在报错
* 空文件报错
* UTF-8 读取成功
* 模板超长报错

`response.test.ts`

* 纯文本响应提取成功
* 结构化输出提取成功
* 无文本时返回 null
* StructuredOutputError 识别成功

`opencode.test.ts`

* attach 成功
* attach 失败后 spawn 成功
* createSession 失败抛错
* abort / delete / close 的清理顺序正确

### 17.2 集成测试

至少要覆盖：

* 已有 server 可用时 attach 成功
* 服务不可用时自动 spawn
* 两段式注入能成功返回结果
* `--json` 模式能得到 structured output
* Ctrl+C 时资源能清理
* 超时后能 abort

### 17.3 验证样例

要准备一组“分工型任务样例”，例如把一个复杂任务分成“分析风险 / 提出修复 / 输出总结”三个职责，验证主代理是否按照模板做出明显分工式回答。这个验证是产品质量要求，不是 SDK 保证。

---

## 18. 依赖与运行配置

### 18.1 `package.json`

建议最小依赖如下。OpenCode SDK 官方通过 npm 安装 `@opencode-ai/sdk`；ts-node 官方建议本地安装并可同时安装 `@types/node`、`tslib`。 ([OpenCode][1])

```json
{
  "type": "module",
  "scripts": {
    "dev": "ts-node run.ts",
    "start": "ts-node run.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --test"
  },
  "dependencies": {
    "@opencode-ai/sdk": "x.y.z"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "ts-node": "^10.0.0",
    "@types/node": "^18.0.0",
    "tslib": "^2.0.0"
  }
}
```

### 18.2 `tsconfig.json`

ts-node 是直接在 Node.js 上执行 TS 的运行时；为了匹配现代 ESM import 风格，这里建议使用 `NodeNext`。这个建议与 ts-node 定位及现代 SDK 的导入方式一致。 ([OpenCode][1])

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["run.ts", "src/**/*.ts", "test/**/*.ts"]
}
```

---

## 19. 实现顺序建议

### Phase 1：跑通主路径

* `cli.ts`
* `config.ts`
* `logger.ts`
* `opencode.ts` 中 attach/spawn/create/delete
* `main.ts` 的正常文本流程

### Phase 2：稳定性

* prompt 校验
* health check
* timeout
* SIGINT/SIGTERM
* cleanup 策略

### Phase 3：输出与质量

* `response.ts`
* `--json`
* StructuredOutputError
* debug 输出
* 测试补齐

### Phase 4：可扩展点

* `--agent`
* `--keep-session`
* 分工样例验证
* attach-session / stdin / dry-run 的预留接口

---

## 20. 已知风险与应对

### 风险 1：SDK 文档与类型定义细节可能存在版本差异

例如结构化输出相关字段在文档表述中可能出现 `format` / `outputFormat` 的差异。应对方式是：**所有 SDK 调用都经过 `opencode.ts` 封装，并以安装版本的实际类型定义为准**。当前文档明确支持 JSON Schema 结构化输出能力，但字段细节应以代码集成时的 SDK 类型为最终准绳。 ([OpenCode][1])

### 风险 2：多代理协作不可控

MVP 不把它当成强承诺，只做样例验证与扩展预留。

### 风险 3：ts-node 在高频生产场景性能有限

官方对 ts-node 的定位是 TypeScript 执行引擎，适合开发和工具场景；若后续演进为高频服务，需切换为编译产物运行。 ([typestrong.org][3])

---

## 21. 完成定义（Definition of Done）

技术层面的 DoD：

* `ts-node run.ts "hello"` 可执行
* attach/spawn 均可运行
* 两段式 prompt 注入生效
* 默认文本输出正常
* `--json` 正常
* timeout / Ctrl+C 正常
* keep-session 生效
* 所有单元测试通过
* typecheck 通过

质量层面的 DoD：

* attach 失败自动 spawn 经真实验证
* StructuredOutputError 可被清晰识别
* 默认输出不含噪音
* 分工样例能体现规则驱动行为

---


[1]: https://opencode.ai/docs/zh-cn/sdk/?utm_source=chatgpt.com "SDK | OpenCode"
[2]: https://opencode.ai/docs/zh-cn/config/?utm_source=chatgpt.com "配置 | OpenCode"
[3]: https://typestrong.org/ts-node/docs/?utm_source=chatgpt.com "Overview | ts-node"
