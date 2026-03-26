下面是一版可直接进入评审的 **MVP PRD 完整稿**。我把前面两位工程师的高价值建议都吸收进去了，尤其补强了 **OpenCode SDK 接口契约、超时/取消、会话与响应模型、配置优先级、风险边界、质量验收标准**。其中与 SDK 行为直接相关的内容，均以 OpenCode 官方 SDK 文档为依据：SDK 提供 `createOpencode()`、`createOpencodeClient()`、`client.global.health()`、`session.create()`、`session.prompt()`、`session.abort()`、`session.delete()`、`app.agents()` 等能力；`session.prompt()` 支持 `noReply: true` 注入上下文；结构化输出支持 JSON Schema。ts-node 方面，官方说明其定位是直接执行 TypeScript 的运行引擎，推荐本地安装并搭配 TypeScript、`@types/node` 使用。 ([OpenCode][1])

---

# PRD：基于 ts-node 的 OpenCode SDK 多代理协作 CLI 工具（MVP）

## 1. 文档信息

**文档名称**
基于 ts-node 的 OpenCode SDK 多代理协作 CLI 工具 PRD（MVP）

**文档目标**
定义一个本地运行的 TypeScript CLI 工具，用于通过 OpenCode SDK 启动或连接 OpenCode 服务，创建会话，注入提示词模板，执行任务，并以标准文本或结构化输出返回结果。工具以单一提示词模板驱动主代理任务规则，并为后续多代理协作能力预留扩展位。OpenCode SDK 官方已明确支持会话创建、提示词发送、会话中止、上下文注入、代理列表读取和结构化输出，这些构成了本工具的可实现基础。 ([OpenCode][1])

**文档范围**
本 PRD 面向 MVP，不承诺一次性实现 OpenCode 全能力，仅覆盖 CLI 运行主路径、SDK 接入、提示词注入、任务执行、取消与清理、结果展示及基本质量保障。

---

## 2. 背景与问题定义

当前已有的单文件脚本可以完成最基本的“读取 prompt + 发送问题 + 输出结果”流程，但存在以下明显问题：

* 代码职责混杂，参数解析、配置、日志、SDK 调用、响应处理耦合在一个文件
* 对 OpenCode SDK 的真实接口契约依赖不透明，难以长期维护
* “多代理/子代理协作”只有目标描述，没有技术边界定义
* 缺少超时、中断、异常清理机制
* 缺少统一的响应归一化层
* 缺少测试与质量验收标准

同时，OpenCode SDK 已提供较完整的会话与服务控制能力：既可以直接 `createOpencode()` 启动内嵌 server，也可以 `createOpencodeClient()` 连接现有实例；可以通过 `global.health()` 探活，通过 `session.prompt()` 注入上下文或触发模型回复，通过 `session.abort()` 中止会话。也就是说，SDK 层已经能支撑一个模块化 CLI 的 MVP。 ([OpenCode][1])

---

## 3. 产品目标

### 3.1 核心目标

提供一个基于 TypeScript + ts-node 的 CLI 工具，满足以下目标：

1. 能以 **模块化工程结构** 替代单文件脚本
2. 能 **连接已有 OpenCode 服务**，连接失败时自动 **启动内嵌服务**
3. 能 **读取 prompt 模板并注入上下文**
4. 能 **创建会话、发送任务、输出结果**
5. 能 **支持中断、超时、会话清理**
6. 能 **支持结构化输出**
7. 为后续 **多代理协作** 预留能力边界和验证机制

### 3.2 非目标

本期不承诺：

* 图形界面
* 完整的项目级多轮知识管理
* 企业级监控与权限中心
* 自动 provider fallback 编排
* 稳定的原生 subagent/task orchestration 承诺

---

## 4. 用户与使用场景

### 4.1 目标用户

* 本地开发者
* 平台工程师
* 需要把 LLM 能力接入工程流程的内部工具开发者

### 4.2 典型场景

* 对一段代码做静态分析、异常排查、优化建议
* 对一个技术问题做基于 prompt 模板的回答
* 使用固定模板规范输出 JSON 结果
* 在已有会话中继续执行任务或注入上下文
* 在任务卡死时通过 Ctrl+C 中断并清理资源

---

## 5. 技术栈与版本要求

### 5.1 技术栈

* Node.js
* TypeScript
* ts-node
* `@opencode-ai/sdk`

### 5.2 最低版本要求

* Node.js >= 18
* TypeScript >= 5
* ts-node >= 10
* `@opencode-ai/sdk`：在项目中锁定一个明确最小版本，MVP 落地时以实际验证通过的版本为准

采用 ts-node 的原因是它支持直接执行 TypeScript，适合本地 CLI 和内部工具开发；官方也建议本地安装，并通常配合 `typescript`、`@types/node` 与 `tslib` 一起使用。 ([typestrong.org][2])

---

## 6. 产品范围

## 6.1 本期范围

* CLI 参数解析
* 配置管理
* 日志输出
* 提示词模板读取与注入
* OpenCode 服务 attach/spawn
* Session 生命周期管理
* 基本响应处理
* 文本与结构化输出
* 超时与取消
* 错误分类与基础测试

## 6.2 二期候选

* attach 到已有 session
* stdin 输入
* 流式事件输出
* 工具调用可视化
* provider fallback 与自动重试策略
* 原生多代理/task 协作增强
* dry-run 模式

---

## 7. OpenCode SDK 接口契约

这是 MVP 的核心补充章节，用于消除“开发无法落地”的问题。

### 7.1 服务创建与连接

OpenCode SDK 支持两种方式：

1. `createOpencode()`
   同时启动 OpenCode server 与 client，可传入 `hostname`、`port`、`timeout`、`signal` 和 `config`。这意味着 CLI 可以在 attach 失败后自动降级为内嵌启动模式。 ([OpenCode][1])

2. `createOpencodeClient()`
   连接已有 server，支持 `baseUrl`、`responseStyle`、`throwOnError` 等参数。注意：创建 client 对象不等于 server 健康可用，必须继续调用 `client.global.health()` 探活。 ([OpenCode][1])

### 7.2 探活

* `client.global.health()`
  返回健康状态与版本信息，用于判断 attach 模式是否真正可用。 ([OpenCode][1])

### 7.3 代理能力读取

* `client.app.agents()`
  返回当前可用代理列表。MVP 可用它做“agent 类型是否存在”的校验。 ([OpenCode][1])

### 7.4 会话管理

SDK 已提供：

* `session.create()`
* `session.get()`
* `session.list()`
* `session.update()`
* `session.delete()`
* `session.abort()`
* `session.messages()`
* `session.message()`
* `session.prompt()`
  这些构成 CLI 的会话主流程。 ([OpenCode][1])

### 7.5 提示词注入

`session.prompt()` 支持：

* 正常发送任务并触发模型回复
* `body.noReply: true` 仅注入上下文，不触发 AI 回复

因此，MVP 采用“双阶段注入策略”：

1. 使用 `noReply: true` 注入 prompt 模板
2. 再发送用户任务内容

这样比把模板和用户输入完全拼成一个字符串更清晰，也更符合 SDK 明确支持的调用方式。 ([OpenCode][1])

### 7.6 模型与输出格式

`session.prompt()` 可传：

* `model`
* `parts`
* `format` / 结构化输出配置（JSON Schema）

SDK 文档明确支持 JSON Schema 结构化输出，并将结果写入 structured output 字段。 ([OpenCode][1])

### 7.7 会话中止

* `session.abort()`
  用于中止正在运行的会话，是实现超时和 Ctrl+C 清理的关键接口。 ([OpenCode][1])

---

## 8. 核心产品假设与风险边界

### 8.1 假设

MVP 依赖以下假设：

* 主代理可以依据提示词模板理解任务规则
* 通过两段式注入，模板上下文能稳定影响后续回答
* OpenCode SDK 的 session 与 agent 能力足以支撑单代理主流程

### 8.2 风险边界：多代理协作

“单提示词驱动多代理协作”是本产品方向，但 **不是本 MVP 已经被 SDK 明确承诺的稳定能力**。当前官方 SDK 文档能够明确确认的，是会话、代理列表、提示词注入、会话中止和结构化输出；没有在本次核对的文档中看到一个足够清晰、可直接写入 PRD 的“原生 subagent/task 编排 API 契约”。因此，本 PRD 对多代理协作的表述改为：

* 本期支持 **在提示词模板中描述主代理职责和分工规则**
* 是否能稳定触发“真实的多代理/子任务分工”，必须通过 PoC 和验收样例验证
* 若当前 SDK 版本未提供稳定原生编排入口，则 MVP 退化为“主代理根据规则完成逻辑分工”的模式

这个边界必须写进 PRD，避免过度承诺。 ([OpenCode][1])

---

## 9. 目标目录结构

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
   └─ opencode.test.ts
```

### 目录设计说明

* `run.ts`：shebang、顶层异常捕获、退出码设置
* `src/main.ts`：业务编排入口
* `src/opencode.ts`：OpenCode SDK 适配层
* `src/response.ts`：响应归一化与提取
* `src/prompt.ts`：模板读取与注入策略
* `test/`：保证可测试性

这里保留 `run.ts` 与 `main.ts` 两个文件，但必须明确边界，避免职责重叠。

---

## 10. 功能需求

## 10.1 CLI 参数

MVP 支持以下参数：

* `--help` / `-h`
* `--debug`
* `--info`
* `--model <name>`
* `--host <hostname>`
* `--port <port>`
* `--prompt <file>`
* `--keep-session`
* `--json`
* `--agent <type>`
* `--timeout <ms>`

候选扩展参数，不纳入首期强制实现：

* `--stdin`
* `--attach-session <id>`
* `--output-format <text|json|markdown>`
* `--dry-run`

### 参数处理要求

* 支持 `--` 作为参数终止符
* 对未知参数报错
* `--help` 显示完整示例、环境变量与优先级规则
* `--keep-session` 为显式行为开关

---

## 10.2 配置管理

### 配置来源优先级

1. CLI 参数
2. 环境变量
3. 默认值

### 冲突处理规则

当 CLI 与环境变量同时存在时：

* **始终以 CLI 参数为准**
* **不报错**
* **不做交互确认**

### 推荐环境变量

* `OPENCODE_MODEL`
* `OPENCODE_HOST`
* `OPENCODE_PORT`
* `OPENCODE_PROMPT`
* `OPENCODE_TIMEOUT_MS`
* `OPENCODE_MAX_INPUT_LENGTH`

OpenCode 本身也会读取配置文件，如 `opencode.json`；本工具只对 CLI 自身使用的运行配置做一层明确覆盖。 ([OpenCode][1])

---

## 10.3 输入与提示词文件校验

### 用户输入校验

* 不能为空
* 不得超过最大长度
* `--json` 模式下需提供 schema 或内置 schema

### 提示词文件校验

必须校验以下场景：

* 文件不存在
* 无权限读取
* 非 UTF-8 或解码失败
* 文件为空
* 内容仅空白字符
* 超过允许注入长度

---

## 10.4 Session 创建与配置

MVP 中 session 创建应支持以下配置模型：

```ts
interface SessionConfig {
  title: string
  agent?: string
  model?: string
  permissions?: unknown
}
```

说明：

* `agent`：用于选择 OpenCode 当前可用代理类型，CLI 可先通过 `app.agents()` 校验
* `model`：用于模型覆盖
* `permissions`：预留权限策略扩展位
  目前 SDK 能明确确认代理列表读取和会话操作，但权限具体 schema 以集成阶段实际类型定义为准。 ([OpenCode][1])

---

## 10.5 Prompt 注入策略

MVP 采用两段式注入：

### 第一步：模板注入

通过：

* `session.prompt({ noReply: true, parts: [...] })`

将 `prompt.md` 作为上下文注入 session，不要求立即生成回复。 ([OpenCode][1])

### 第二步：用户任务发送

再发送用户实际任务内容：

* `session.prompt({ parts: [...] })`

### 这样设计的理由

* 逻辑上更清晰
* 更贴近 SDK 明确能力
* 便于后续扩展多轮对话与 session 复用
* 能区分“规则上下文”和“本轮任务”

---

## 10.6 服务连接模式

### attach 模式

流程：

1. 调用 `createOpencodeClient({ baseUrl })`
2. 调用 `client.global.health()`
3. 探活成功即进入会话流程

### spawn 模式

当 attach 失败时：

1. 调用 `createOpencode({ hostname, port, timeout, signal, config })`
2. 获取 `client` 与 `server`
3. 任务结束后，在 `finally` 中关闭由本进程启动的 server

### 约束

* attach 失败不得直接退出
* 仅在“本进程启动了 server”时才负责关闭
* server 关闭失败仅记录 debug 日志

OpenCode SDK 明确支持这两种模式和对应的参数。 ([OpenCode][1])

---

## 10.7 会话生命周期管理

标准流程：

1. 读取配置
2. attach 或 spawn
3. 创建 session
4. 注入模板
5. 发送任务
6. 解析结果
7. 输出结果
8. 根据 `--keep-session` 决定是否删除 session
9. 若为 spawn 模式则关闭 server

### keep-session 规则

* 默认行为：**执行完成后删除 session**
* 当指定 `--keep-session` 时：保留 session，并在输出中明确提示 session ID

说明：虽然 OpenCode session 支持持久化与列表读取，但作为 CLI MVP，为避免默认积累大量临时会话，本工具默认删除；显式指定时才保留。SDK 文档已明确支持 `session.list()` 与 `session.delete()`。 ([OpenCode][1])

---

## 10.8 超时、取消与信号处理

这是 MVP 必须新增的能力。

### 超时

* 支持 `--timeout`
* 支持 `OPENCODE_TIMEOUT_MS`
* 达到超时时：

  * 优先调用 `session.abort()`
  * 标记本次执行失败
  * 进入清理流程

### 用户中断

监听：

* `SIGINT`
* `SIGTERM`

收到信号后：

1. 若当前存在运行中 session，则调用 `session.abort()`
2. 执行 session 清理
3. 若为 spawn 模式则关闭 server
4. 以非零退出码结束

### 循环保护

对“主代理陷入重复调用/迟迟不返回”的情况，MVP 通过 **超时 + abort** 实现硬性止损，不在本期实现复杂的循环语义分析。

SDK 已明确支持 `createOpencode()` 接收 `signal` 和 `timeout`，也支持 `session.abort()`，因此这一需求具备实现基础。 ([OpenCode][1])

---

## 10.9 响应处理

`response.ts` 必须是一个独立模块，负责归一化所有 SDK 返回。

### MVP 需支持的响应要素

* 文本 parts
* 非文本 parts
* structured output
* 错误信息
* 原始响应摘要（debug 模式）

### 输出策略

* 默认模式：仅显示用户可读文本
* `--json`：优先输出结构化结果
* `--debug`：附加输出关键元数据与非文本 part 摘要
* 不得在默认模式下直接 dump 全量原始对象

SDK 文档明确显示 session 消息以 `info + parts` 形式存在，结构化输出单独可读。 ([OpenCode][1])

---

## 10.10 结构化输出

MVP 支持 JSON Schema 输出模式。

### 行为要求

* 通过 `session.prompt()` 指定 JSON Schema
* 对 structured output 做读取与校验
* 如模型多次重试后仍无法满足 schema，应返回清晰错误

OpenCode SDK 文档说明：结构化输出使用 JSON Schema，失败时会出现 `StructuredOutputError`，并可配置重试次数。 ([OpenCode][1])

---

## 10.11 多代理协作（MVP 表述）

本节必须谨慎。

### MVP 能力目标

* 允许在单一 prompt 模板中描述主代理职责、分工规则和子任务边界
* 允许指定 agent 类型
* 允许通过样例任务验证“是否按规则进行了分工式回答”

### MVP 不承诺

* 不承诺 SDK 已稳定提供可直接控制的原生 subagent/task 编排接口
* 不承诺单次提示词就一定稳定触发真实子代理执行
* 不承诺多代理并行编排的确定性行为

### 验收要求

必须新增一条：
**至少通过一组样例任务验证主代理能依据提示词规则表现出可观察的分工行为，而不是只验证 CLI 流程跑通。**

---

## 11. 非功能需求

## 11.1 可维护性

* 所有职责必须分层
* SDK 相关逻辑集中在 `opencode.ts`
* 响应解析逻辑集中在 `response.ts`
* 不允许在深层 helper 中调用 `process.exit()`

## 11.2 可测试性

至少以下模块必须可单测：

* `cli.ts`
* `config.ts`
* `prompt.ts`
* `response.ts`

`opencode.ts` 应支持 mock SDK 或依赖注入，以便测试 attach / spawn / abort / cleanup 路径。

## 11.3 健壮性

* attach 失败要自动尝试 spawn
* 中断时要尽量回收 session 与 server
* 任何 cleanup 失败都不能覆盖主错误信息
* 默认输出要保持可读

## 11.4 性能

MVP 不以极致性能为目标，但应满足：

* 正常短任务在开发机环境下有可接受响应时间
* 默认日志不应显著拖慢执行
* ts-node 模式用于开发与内部工具；未来需预留编译后运行能力

ts-node 官方定位就是运行时执行 TS，而非生产环境高性能编译部署方案。 ([typestrong.org][3])

## 11.5 安全性

MVP 至少考虑：

* 对 prompt 文件做只读读取，不执行文件内容
* 不在默认日志中打印敏感配置
* 可预留 `--dry-run` 作为后续增强项
* 对可选文件路径输入做基本合法性校验

---

## 12. 错误分类

### 12.1 输入错误

* 用户输入为空
* 输入过长
* 参数非法

### 12.2 配置错误

* 端口非法
* timeout 非法
* agent 配置非法
* model 配置不合法

### 12.3 提示词错误

* 文件不存在
* 无权限读取
* 解码失败
* 内容为空
* 内容仅空白
* 超长

### 12.4 服务连接错误

* attach 失败
* health check 失败
* spawn 超时
* server 启动失败

### 12.5 会话错误

* create 失败
* prompt 失败
* abort 失败
* delete 失败

### 12.6 输出错误

* 无文本返回
* structured output 为空
* `StructuredOutputError`
* schema 校验失败

### 12.7 中断与超时错误

* 用户 Ctrl+C
* SIGTERM
* 任务超时
* 中断后资源清理失败

---

## 13. 依赖与工程配置

### 13.1 package.json 依赖建议

```json
{
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

OpenCode SDK 官方安装方式为 npm 安装 `@opencode-ai/sdk`；ts-node 官方安装页建议本地安装并视情况补充 `@types/node` 与 `tslib`。 ([OpenCode][1])

### 13.2 tsconfig 建议

建议采用 NodeNext + ESM 风格，以匹配现代 SDK 导入习惯。这个是基于官方示例使用现代 import 语法而给出的工程建议。 ([OpenCode][1])

---

## 14. 验收标准

这一版验收标准分为“流程标准”和“质量标准”。

### 14.1 流程标准

1. 可通过 `ts-node run.ts "hello"` 正常执行
2. 当已有 OpenCode server 可用时，能 attach 成功
3. attach 失败时，能自动 spawn 新 server
4. 能正确读取并注入 `prompt.md`
5. 能创建 session 并发送任务
6. 能输出文本结果
7. `--json` 模式能输出结构化结果
8. `--debug` 模式能输出附加调试信息
9. 默认情况下执行完成后删除 session
10. 指定 `--keep-session` 时保留 session 并输出 session ID
11. spawn 模式下任务结束后关闭 server
12. `typecheck` 无类型错误

### 14.2 质量标准

13. attach 失败自动 spawn 的降级路径必须通过真实故障注入验证
14. 收到 Ctrl+C 时，工具必须尝试 `session.abort()` 并完成资源清理
15. 默认输出必须保持用户可读，不得出现大段原始对象噪音
16. 结构化输出失败时，必须返回明确错误，而不是静默空结果
17. 至少准备一组“分工型任务”样例，验证主代理能依据提示词表现出可观察的分工行为
18. 常规短任务应在本地开发环境下保持可接受响应时间，不出现无边界挂起

---

## 15. 里程碑建议

### M1：单代理主路径

* attach/spawn
* create session
* prompt 注入
* 文本输出
* cleanup

### M2：稳定性与质量

* timeout
* SIGINT/SIGTERM
* abort
* debug
* 测试

### M3：增强输出与协作能力

* JSON Schema 输出
* agent 校验
* 分工样例验证
* keep-session

---

## 16. 示例命令

```bash
npx ts-node run.ts "分析这段 TypeScript 代码的空指针风险"
```

```bash
npx ts-node run.ts --debug --model opencode/big-pickle "检查这个函数是否有资源泄露"
```

```bash
npx ts-node run.ts --json --timeout 30000 "提取这段文本中的结构化字段"
```

---

## 17. 结论

这版 MVP PRD 的核心原则是：

* **功能上可实现**
* **边界上不夸大**
* **工程上可维护**
* **质量上可验证**

它已经把“只是一个能跑的脚本”提升为“一个可评审、可开发、可测试的 CLI 产品定义”。其中最关键的修正有三点：

1. 明确了 OpenCode SDK 的真实接口契约
2. 把多代理协作从“宣传语”改成“可验证目标 + 风险边界”
3. 增加了超时、中断、清理和质量验收要求



[1]: https://opencode.ai/docs/zh-cn/sdk/?utm_source=chatgpt.com "SDK | OpenCode"
[2]: https://typestrong.org/ts-node/docs/installation/?utm_source=chatgpt.com "Installation | ts-node"
[3]: https://typestrong.org/ts-node/docs/?utm_source=chatgpt.com "Overview | ts-node"
