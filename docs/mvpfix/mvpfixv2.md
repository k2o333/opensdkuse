下面是我整理后的 **修复清单 v2**。它吸收了你提到的评审意见，重点做了这几件事：

* 先修会影响后续开发与测试稳定性的项
* 先做 **SDK 路线决策**，再做 SDK 兼容层
* 给每个修复项补上：

  * 目标
  * 影响范围
  * 实施步骤
  * 风险
  * 回归测试
  * 完成标准

这版清单按 **执行顺序** 来排，不再只是按严重级别堆问题。

---

# 修复清单 v2

## 0. 执行原则

### 0.1 总原则

这次修复不是“想到哪改到哪”，而是按下面顺序推进：

1. 先修会污染测试环境的问题
2. 再确定 SDK 路线
3. 再修用户可见行为偏差
4. 再修 SDK 适配与配置透传
5. 最后补 README、测试和增强项

### 0.2 本轮不做的事

这轮不要做这些扩展，避免偏离 MVP：

* 不新增原生 subagent orchestration
* 不做复杂多 provider fallback
* 不做大规模 CLI 参数扩展
* 不做“兼容所有未知 SDK 版本”的通用框架

### 0.3 兼容边界

“兼容层”只兼容两类东西：

* 你当前仓库已经在使用的返回结构
* 官方文档或当前目标 SDK 版本明确可见的返回结构

不要为了“可能将来会变”去写过宽的分支。

---

# P0-A：先修测试环境稳定性

## 1. 修复 signal handler 注册/解绑问题

### 目标

修复 `SIGINT` / `SIGTERM` 监听器无法正确解绑的问题，避免测试反复运行时监听器累积。

### 影响文件

* `src/main.ts`
* `test/main.test.ts` 或对应测试文件

### 实施步骤

1. 把匿名 signal handler 提升为具名常量
2. `process.on()` 和 `process.off()` 使用同一个函数引用
3. 确保 `finally` 中一定执行解绑
4. 检查中断后是否会重复触发 abort/cleanup

### 建议代码形态

```ts
const handleSigint = () => onSignal("SIGINT")
const handleSigterm = () => onSignal("SIGTERM")

process.on("SIGINT", handleSigint)
process.on("SIGTERM", handleSigterm)

try {
  // main flow
} finally {
  process.off("SIGINT", handleSigint)
  process.off("SIGTERM", handleSigterm)
}
```

### 风险

* 现有依赖匿名函数行为的测试可能要改
* 某些 mock 写法如果直接断言 `process.on` 参数，可能需要同步更新

### 回归测试

至少补 2 个：

1. 连续多次调用 `main()` 后，signal listener 数量不增加
2. 触发 `SIGINT` 时，只执行一次 abort 流程

### 完成标准

* 没有监听器泄漏
* cleanup 相关测试可稳定重复运行

---

# P0-B：确定 SDK 路线

## 2. 做出明确的 SDK 适配决策

### 目标

先决定项目到底走哪条 SDK 路线，避免后面 response 兼容层和 session 适配返工。

### 选项

#### 方案 1：迁到公开 API

使用官方公开入口和公开调用风格。

适合：

* 你希望仓库更标准
* 后续别人容易接手
* 更贴近官方文档

#### 方案 2：继续使用当前 v2 路径

保留现有 `v2` 风格适配，但明确锁版本和边界。

适合：

* 当前实现已经大量依赖 v2 风格
* 你要先稳住 MVP，不想大改

### 建议

**MVP 阶段优先建议：先明确并锁死当前可跑通的路线。**
如果你现在代码已经大面积依赖 v2 风格，且测试也按这套写，短期更稳的是：

* 先保留当前路线
* 锁定 SDK 版本
* README 明确写“当前绑定的 SDK 版本和接口风格”
* 后续再做“迁移到公开 API”的独立任务

### 影响文件

* `package.json`
* `README.md`
* `src/opencode.ts`
* `src/response.ts`
* 测试相关 mock 文件

### 实施步骤

1. 确认当前项目实际安装并验证通过的 SDK 版本
2. 决定：

   * 保留 v2 适配
   * 或迁移公开 API
3. 把 `package.json` 的 `"latest"` 改成固定版本
4. 在 README 增加版本矩阵
5. 在 `src/opencode.ts` 顶部写清：

   * 当前适配哪套 API 形态
   * 与官方公开文档是否存在差异

### 风险

* 切 SDK 路线会导致 mock/test 大面积调整
* response 解析逻辑要跟着改

### 回滚计划

如果你决定尝试迁公开 API，建议这样做：

1. 保留现有 `opencode.ts`
2. 新开 `opencode.public.ts`
3. 用薄 facade 切换
4. 测试跑通后再删除旧适配层

### 回归测试

* attach 成功
* attach 失败后 spawn
* create session
* prompt
* abort
* delete

### 完成标准

* SDK 路线明确
* 版本锁定
* README 有版本矩阵
* 开发者看到仓库就知道当前适配哪套 SDK

---

# P0-C：修正 `--json` 的真实语义

## 3. 把 `--json` 改成真正的 structured output 模式

### 目标

让 `--json` 真正驱动模型按 JSON Schema 输出，而不是只把普通响应包装成 JSON 打印。

### 当前问题

现在的 `--json` 更像“终端打印 JSON”，而不是“调用 SDK 的 structured output”。

### 实施建议

MVP 这轮建议采用：

* **必选 schema**
* 支持 `--schema-file <path>`
* 没有 schema 时直接报错

不建议只做“内置默认 schema”作为唯一方案，因为容易让功能看起来很全，实际很窄。

### 影响文件

* `src/cli.ts`
* `src/main.ts`
* `src/opencode.ts`
* `src/response.ts`
* `README.md`
* 测试文件

### 实施步骤

1. 给 CLI 增加 `--schema-file`
2. 当 `--json` 开启时：

   * 读取 schema 文件
   * 解析并校验 JSON Schema
3. 把 schema 通过 `promptOpts.structured` 传给 `executePrompt()`
4. `executePrompt()` 里真正构造 SDK 的 structured output 请求
5. `response.ts` 里优先读取 structured output
6. 没有 schema 时直接报错，不降级

### 风险

* 这会改变现有 `--json` 用户习惯
* 之前把 `--json` 当“美化 JSON 打印”的用户会觉得行为变了

### 风险缓解

* README 明确说明变更
* changelog 或发布说明写清楚
* 如果你担心破坏用户习惯，可以保留一个内部 helper：

  * 普通调试 JSON 打印只在 `--debug` 下做
  * `--json` 专门保留给 structured output

### 方案对比

#### A. 内置默认 schema

* 工作量低
* 灵活性低
* 只适合 MVP 演示

#### B. `--schema-file`

* 工作量中
* 灵活性高
* 推荐

#### C. 无 schema 时报错

* 工作量低
* 约束清晰
* 适合作为默认策略

### 推荐组合

**B + C**

* 支持 `--schema-file`
* 没有 schema 就报错

### 回归测试

1. `--json --schema-file valid.json`

   * 预期：调用 structured output
   * 输出合法 structured result
2. `--json` 但没传 schema

   * 预期：明确报错
3. schema 文件不存在

   * 预期：明确报错
4. schema 非法 JSON

   * 预期：明确报错

### 完成标准

* `--json` 不再是伪结构化输出
* CLI、README、代码行为一致

---

# P0-D：按已选 SDK 路线修 response 解析

## 4. 重构 response 解析，但只做“有边界的兼容”

### 目标

在确定 SDK 路线后，重构 `response.ts`，让它兼容当前项目实际要支持的返回结构，而不是无限泛化。

### 兼容边界

只兼容这些：

1. 当前项目实际跑出的结构
2. 当前锁定 SDK 版本已知结构
3. 如果 README/文档明确要求的字段名存在差异，则兼容这一个差异层

不要兼容“未来可能出现的各种结构”。

### 影响文件

* `src/response.ts`
* `src/opencode.ts`
* `test/response.test.ts`

### 实施步骤

1. 明确当前项目使用 `responseStyle` 是什么
2. 如果需要，attach client 时显式设置 `responseStyle`
3. 在 `response.ts` 中拆成小函数：

   * 取根对象
   * 取 `info`
   * 取 `parts`
   * 取 text
   * 取 structured output
   * 取 error
4. structured output 只兼容必要字段，例如：

   * `structured_output`
   * `structured`
5. error 只兼容必要字段，例如：

   * `error.message`
   * `error.data?.message`
6. 所有字段读取失败都要可预测返回 `null`，不要抛奇怪异常

### 风险

* 改 response 解析后，现有测试可能因为断言路径变化而失败
* 如果兼容分支写太多，会让代码复杂化

### 风险控制

* 每一种兼容只保留一条注释，解释“为什么存在”
* 兼容逻辑集中在 `response.ts`，不要扩散到业务层

### 回归测试

最少覆盖：

1. 普通文本响应
2. structured output 响应
3. structured output 字段名差异
4. error.message 形式
5. error.data.message 形式
6. parts 缺失时返回空结果而不是崩溃

### 完成标准

* 业务层不再直接猜 SDK 返回结构
* response 兼容逻辑边界清楚
* 测试能说明每一种兼容为什么存在

---

# P0-E：对齐 session config 的真实行为

## 5. 修正 `agent / model / permissions` 的生效方式

### 目标

避免“参数看起来支持，但实际上没生效”。

### 影响文件

* `src/main.ts`
* `src/opencode.ts`
* `src/cli.ts`
* `README.md`

### 实施步骤

1. 明确 `model` 的生效位置：

   * 如果只在 `session.prompt()` 生效，就在文档里写明
2. 明确 `agent` 的生效位置：

   * 如果只是预检查而非 session.create 配置，也要写清楚
3. 明确 `permissions` 是否当前支持：

   * 如果不支持，就不要暴露给用户
4. 修改 `SessionConfig`，只保留真实会生效的字段
5. 或者如果 SDK 当前支持透传，就真的透传

### 风险

* 文档、help、代码需要一起改
* 以前写的测试名可能要调整语义

### 回归测试

1. `--model xxx`

   * 预期：在 prompt 执行处被消费
2. `--agent xxx`

   * 预期：要么真实生效，要么明确提示只做校验
3. 不支持的 `permissions`

   * 预期：不要静默接受

### 完成标准

* 参数存在即有明确作用
* README 和 help 描述不误导用户

---

# P1：文档、测试、行为一致性修复

## 6. 锁定版本并补版本矩阵

### 目标

让安装与运行结果可重复。

### 影响文件

* `package.json`
* `README.md`

### 实施步骤

1. SDK 从 `"latest"` 改成明确版本
2. README 增加版本矩阵：

   * 工具版本
   * SDK 版本
   * Node 版本

### 完成标准

* 任何人按 README 安装都能得到接近一致的环境

---

## 7. 拆分 timeout 语义

### 目标

不要让一个 timeout 同时表示“server 启动超时”和“整个任务执行超时”。

### 影响文件

* `src/config.ts`
* `src/main.ts`
* `src/opencode.ts`
* `README.md`

### 建议

拆成：

* `serverStartupTimeoutMs`
* `executionTimeoutMs`

### 回归测试

* server 启动慢但任务总时长正常
* 任务执行超时后 abort 生效

### 完成标准

* timeout 字段语义清楚

---

## 8. agent 校验失败时改成可见策略

### 目标

让用户明确知道 agent 是否真的验证成功。

### 建议

* 默认输出 warning
* 可选增加 `--strict-agent`
* strict 模式下校验失败直接报错

### 完成标准

* 用户不会误以为 agent 一定生效了

---

## 9. README 和 help 全面对齐

### 目标

让文档和代码行为完全一致。

### 至少补这些内容

* `--json` 的真实语义
* schema 来源
* `--keep-session` 行为
* timeout 行为
* 当前 SDK 路线
* 已知限制

### 完成标准

* README、help、代码、测试四者一致

---

## 10. 把测试从“数量”改成“关键场景覆盖”

### 目标

不要再强调“105 个测试”，而是强调“关键风险被覆盖”。

### 测试策略

#### 纯单元测试

适合 mock：

* CLI 参数解析
* prompt 文件校验
* response 解析

#### SDK 适配测试

建议 mock SDK：

* attach 成功
* attach 失败后 spawn
* createSession / prompt / abort / delete 路径

#### 少量集成测试

可选真实 SDK 环境：

* 真正 structured output
* 真实 attach 到 server
* cleanup 顺序

### 必补测试案例

1. `--json + schema-file` 成功
2. `--json` 无 schema 报错
3. attach 失败自动 spawn
4. `SIGINT` 触发 abort
5. `--keep-session` 不 delete
6. timeout 后 cleanup 顺序正确
7. response 兼容必要字段名差异

### 完成标准

* 测试能证明关键行为
* 不再只是“测试很多”

---

# P2：增强项

## 11. 增加 `--schema-file`

如果 P0-C 已经采用，就这里算完成；如果 P0-C 先做的是内置 schema，这里补完整。

---

## 12. 增加机器可读输出策略

例如在 `--json` 模式中统一输出：

* `result`
* `sessionId`
* `mode`
* `error`

这样后续脚本更好接。

---

## 13. 在 README 增加“已知限制”

至少写：

* 当前多代理只是提示词级规则驱动
* 当前适配的 SDK 版本和路线
* structured output 依赖 schema
* attach/spawn 的优先顺序

---

# 推荐执行顺序（最终版）

## 第一阶段：稳定基础

1. 修 signal handler 解绑
2. 锁定 SDK 路线
3. 锁定 SDK 版本并更新 README 版本矩阵

## 第二阶段：修核心行为

4. 修 `--json` 真实语义
5. 修 response 解析
6. 修 session config 生效点

## 第三阶段：修一致性

7. 拆分 timeout 语义
8. agent 校验失败改成可见策略
9. README/help 全面对齐

## 第四阶段：补验证

10. 补关键场景测试
11. 跑全量 typecheck/test
12. 做一轮手工回归

---

# 手工回归清单

修完后至少手工跑这些命令：

1. 普通文本输出

```bash
npm run dev -- "hello"
```

2. attach 失败自动 spawn

```bash
npm run dev -- --debug "hello"
```

3. keep session

```bash
npm run dev -- --keep-session "hello"
```

4. structured output

```bash
npm run dev -- --json --schema-file ./schemas/basic.json "提取结构化字段"
```

5. timeout

```bash
npm run dev -- --timeout 1 "long task"
```

6. Ctrl+C

* 在任务执行时手动中断
* 验证 abort / cleanup / exit code

---

# 交付标准

这轮修完，才算进入“可放心交付的 MVP”状态：

* `--json` 真正使用 structured output
* SDK 路线明确且版本锁定
* response 兼容边界清楚
* signal 不泄漏
* `agent/model` 的真实作用点明确
* README 与实际行为一致
* 测试证明关键风险已被覆盖


