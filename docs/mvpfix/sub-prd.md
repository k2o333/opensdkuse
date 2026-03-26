下面给你 5 个可直接分发给不同 agent / subagent 的 **完整子 PRD**。
每个子 PRD 都包含：

* 背景
* 目标
* 范围
* 非目标
* 依赖关系
* 设计约束
* 交付物
* 验收标准
* 风险与回滚
* 实施建议

我默认这些子 PRD 对应你的仓库现状，开发目录仍然以你的代码仓库为准。

---

# 子 PRD-A：运行时稳定性与清理链路修复

## 1. 背景

当前 MVP 已实现基本的 timeout、signal、cleanup 机制，但运行时存在一个高优先级稳定性问题：`SIGINT` / `SIGTERM` 的监听器注册与解绑实现存在风险，可能造成监听器泄漏、测试环境污染、重复触发 abort/cleanup、以及多次执行时的非预期副作用。

这类问题虽然不直接影响主功能是否“能跑”，但会持续影响后续测试、回归和并行开发，因此必须优先修复。

---

## 2. 目标

本子 PRD 的目标是：

1. 修复 signal handler 注册与解绑逻辑
2. 统一 timeout 与用户中断的清理链路
3. 明确 cleanup 顺序并固定实现
4. 增加相关测试，确保后续多次运行不产生副作用

---

## 3. 范围

### 3.1 包含内容

* `SIGINT` / `SIGTERM` handler 修复
* `finally` 中的 listener 卸载
* 中断与 timeout 共享 cleanup 主路径
* cleanup 顺序检查与梳理
* 相关测试补齐

### 3.2 不包含内容

* SDK 路线迁移或版本锁定
* `--json` 行为重构
* schema 文件机制
* response 兼容层重构
* README 全量重写
* GitHub Actions 配置

---

## 4. 问题定义

当前问题核心在于：

* signal 注册使用匿名函数
* signal 卸载时使用了新的匿名函数
* `process.off()` 无法移除原监听器
* 多次运行主流程时可能累积 listener
* cleanup 的顺序和触发路径需要更稳定、更一致

---

## 5. 目标用户/受益方

* 开发 agent：减少测试和本地调试时的污染
* QA agent：可稳定重复运行测试
* review agent：能更容易判断资源清理逻辑是否符合文档

---

## 6. 依赖关系

### 6.1 前置依赖

无。

### 6.2 后置依赖

本子 PRD 的结果会影响：

* 子 PRD-D（会话与响应语义对齐）的测试稳定性
* 子 PRD-E（测试与 CI 收敛）的回归质量

---

## 7. 设计约束

1. `process.on()` 与 `process.off()` 必须使用同一个函数引用
2. signal 处理函数必须是可复用、可测试的稳定对象
3. timeout 与 signal 必须尽量复用清理逻辑，不允许两条完全不同的 cleanup 实现
4. cleanup 顺序必须固定：

   * abort session
   * delete session（除非 keep-session）
   * close spawned server
5. cleanup 失败不能覆盖主错误
6. 任何深层 helper 不得调用 `process.exit()`

---

## 8. 功能要求

### 8.1 Signal 处理

支持：

* `SIGINT`
* `SIGTERM`

行为要求：

* 仅响应一次主要清理流程
* 若 session 正在运行，优先调用 abort
* 最终进入统一 cleanup

### 8.2 Timeout 处理

行为要求：

* 达到 timeout 后调用 abort
* 抛出 timeout 错误
* 进入统一 cleanup

### 8.3 Cleanup 处理

行为要求：

* spawned server 才关闭
* keep-session 时不 delete session
* cleanup 内部错误只记录，不得覆盖主错误

---

## 9. 关键实现建议

建议改为：

```ts id="c6rt0u"
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

并且把 timeout 与 signal 最终都汇总到同一 cleanup 主链路。

---

## 10. 交付物

必须交付：

* 修复后的 `src/main.ts`
* 如有必要的辅助函数调整
* 新增或更新的测试文件
* 一份简短说明，解释：

  * signal 设计
  * timeout 与 cleanup 的关系
  * cleanup 顺序

---

## 11. 验收标准

### 11.1 功能验收

* 多次运行主流程后 listener 数量不增长
* `SIGINT` 触发时只执行一次 abort/cleanup
* `SIGTERM` 行为一致
* timeout 触发后走同一 cleanup 主路径

### 11.2 质量验收

* 相关测试可稳定重复运行
* cleanup 失败不会覆盖主错误
* keep-session 与 spawned server 行为仍正确

---

## 12. 测试要求

至少新增/更新这些测试：

1. 多次运行 `main()` 不累积 signal listener
2. `SIGINT` 时调用 `abort -> delete/skip -> close server`
3. `SIGTERM` 时行为同上
4. timeout 时 cleanup 顺序正确
5. keep-session 时不会 delete session

---

## 13. 风险

* 现有 signal 相关测试可能要改
* 旧的 mock/断言如果依赖匿名函数或调用次数，可能失效

---

## 14. 回滚方案

如修复后引入大面积回归：

1. 保留当前 cleanup 流程主体
2. 只回退 signal 注册/解绑方式
3. 将 signal 处理改造隔离为单独小函数，便于局部回滚

---

## 15. Definition of Done

完成本子 PRD 的定义是：

* signal handler 无泄漏
* cleanup 行为稳定
* timeout 和 signal 共用主清理路径
* 测试通过
* 不影响现有主功能链路

---

# 子 PRD-B：SDK 路线与版本基线收敛

## 1. 背景

当前项目对 OpenCode SDK 的调用方式、依赖路径、返回结构已有明确实现，但项目内尚未正式定义“当前适配哪条 SDK 路线”。这会导致：

* 新接手的开发者不知道要以哪套 API 为准
* 后续 response 兼容层可能返工
* 升级 SDK 时不清楚影响边界
* `"latest"` 依赖带来不可重复构建风险

---

## 2. 目标

本子 PRD 的目标是：

1. 明确项目当前采用的 SDK 路线
2. 锁定 SDK 版本
3. 建立版本兼容矩阵
4. 明确适配边界和升级策略

---

## 3. 范围

### 3.1 包含内容

* 决定 SDK 路线
* 锁定 `@opencode-ai/sdk` 版本
* 更新 `package.json`
* README 增加版本矩阵与适配说明
* 在适配层增加说明性注释
* 如需要，制定迁移/回滚策略

### 3.2 不包含内容

* `--json` 逻辑修改
* signal 修复
* response 兼容层具体实现
* session 行为收口
* CI workflow

---

## 4. 问题定义

当前问题主要有：

* 依赖版本使用 `latest`
* 项目中对 SDK 的调用形态与公开文档存在潜在差异
* 没有正式声明当前绑定的 SDK 契约
* 后续修复容易在“继续当前路线”与“迁公开 API”之间摇摆

---

## 5. 目标用户/受益方

* Implementation agent：明确按哪套 API 开发
* QA agent：知道该 mock 哪套返回结构
* Review agent：能判断实现是否符合既定路线
* 未来维护者：快速识别版本边界

---

## 6. 依赖关系

### 6.1 前置依赖

无强依赖。

### 6.2 后置依赖

本子 PRD 会直接影响：

* 子 PRD-C（JSON structured output）
* 子 PRD-D（session 和 response 语义）

---

## 7. 决策项

必须做出明确决策：

### 方案 1：继续沿用当前实现路线

优点：

* MVP 改动最小
* 风险最低
* 不用大面积重写适配层

缺点：

* 可能和公开文档不完全一致
* 未来升级要更谨慎

### 方案 2：迁移到官方公开 API 风格

优点：

* 更标准
* 对外更容易理解
* 长期维护可能更稳

缺点：

* 本轮改动大
* 测试和 mock 可能重写较多
* 容易超出 MVP 修复范围

### 推荐

MVP 本轮优先建议：
**锁定当前可跑通路线**，不要在本轮同时做大规模 SDK 风格迁移。

---

## 8. 设计约束

1. 不允许继续使用 `"latest"`
2. 必须在 README 中明确：

   * 工具版本
   * SDK 版本
   * Node 最低版本
   * 当前适配路线说明
3. 必须在适配层代码中写注释说明当前绑定的接口风格
4. 如果尝试迁移 SDK 路线，必须提供回滚计划

---

## 9. 版本矩阵要求

README 必须新增一个矩阵，格式可参考：

```text id="kgm6g5"
| 工具版本 | 验证 SDK 版本 | Node 版本 | 说明 |
|---------|---------------|----------|------|
| 0.1.x   | x.y.z         | >=18     | 当前适配版本 |
```

---

## 10. 交付物

必须交付：

* 更新后的 `package.json`
* README 版本矩阵
* `src/opencode.ts` 顶部适配说明
* 如有必要的迁移说明文档或注释

---

## 11. 验收标准

### 11.1 功能验收

* SDK 版本已锁定
* 项目可重复安装
* README 中能看出当前适配哪套 SDK 契约

### 11.2 质量验收

* 未来 agent 拿到仓库后不需要猜 SDK 路线
* response 层与 session 层后续开发有明确边界

---

## 12. 测试要求

本子 PRD 不要求新增大量业务测试，但至少要保证：

* 锁版本后安装仍通过
* 主链路基本 smoke test 不失败

---

## 13. 风险

* 如果你决定迁路线，可能引起适配层和测试大改
* README 与当前实现可能短期不一致，需要同步修订

---

## 14. 回滚方案

如果尝试迁公开 API 失败：

1. 保留当前适配层
2. 新路线适配单独放文件
3. 暂不切换主入口
4. 在 README 中说明“迁移尝试未完成，当前仍以既有路线为准”

---

## 15. Definition of Done

* 版本锁定
* README 有版本矩阵
* 当前 SDK 路线明确
* 后续开发不再需要猜依赖边界

---

# 子 PRD-C：`--json` 真实结构化输出重构

## 1. 背景

当前 CLI 已有 `--json` 选项，但其行为更接近“将结果以 JSON 形式输出”，而不是真正请求模型返回受 JSON Schema 约束的 structured output。这会导致功能语义与文档、用户预期不一致。

---

## 2. 目标

本子 PRD 的目标是：

1. 让 `--json` 真正触发 structured output 路径
2. 引入 `--schema-file` 作为 schema 输入来源
3. 没有 schema 时明确报错
4. 为用户提供最小可用 schema 示例

---

## 3. 范围

### 3.1 包含内容

* `--json` 语义重构
* 新增 `--schema-file`
* schema 文件读取与校验
* structured output 调用
* structured output 结果输出
* README 和示例更新
* 测试补齐
* 新增示例 schema 文件

### 3.2 不包含内容

* SDK 路线迁移
* signal 修复
* response 广泛兼容层
* CI 配置

---

## 4. 问题定义

当前问题：

* `--json` 并未强制要求 schema
* 没有真正触发 structured output 路径
* 用户可能误以为自己拿到的是 schema 约束输出

---

## 5. 目标用户/受益方

* CLI 使用者：行为可预测
* 开发者：实现与文档一致
* QA：结构化输出更容易断言

---

## 6. 依赖关系

### 6.1 前置依赖

强依赖子 PRD-B。
必须先明确 SDK 路线和版本边界。

### 6.2 后置依赖

会影响：

* 子 PRD-D 的 response 解析
* 子 PRD-E 的 README、help 和测试收口

---

## 7. 设计决策

### 推荐方案

采用 **B + C** 策略：

* 支持 `--schema-file <path>`
* 开启 `--json` 但没有 schema 时，直接报错

### 不推荐

* 仅靠内置默认 schema 作为唯一方案

---

## 8. schema 示例要求

建议新增一个实际文件：

```text id="xv0pdm"
schemas/basic.json
```

内容如下：

```json id="5g5knx"
{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["summary"]
}
```

---

## 9. 设计约束

1. `--json` 必须真正走 structured output 路径
2. `--schema-file` 文件必须做基础校验：

   * 存在
   * 可读
   * 是合法 JSON
   * 至少是对象结构
3. 不允许在缺少 schema 时静默降级为普通 JSON 打印
4. structured output 读取必须走统一适配层，不得散落在业务代码中

---

## 10. 交付物

必须交付：

* `src/cli.ts`：新增 `--schema-file`
* `src/main.ts`：structured 配置接入
* `src/opencode.ts`：structured output 调用
* `src/response.ts`：structured result 提取
* `schemas/basic.json`
* README 示例更新
* 测试补齐

---

## 11. 验收标准

### 11.1 功能验收

* `--json --schema-file schemas/basic.json` 能真正请求 structured output
* schema 缺失时明确报错
* schema 非法时明确报错
* structured output 能被正确输出

### 11.2 质量验收

* `--json` 行为不再误导用户
* 文档、help、代码一致

---

## 12. 测试要求

至少补这些测试：

1. `--json --schema-file valid.json`

   * 预期：structured output 被请求
2. `--json` 无 schema

   * 预期：报错
3. schema 文件不存在

   * 预期：报错
4. schema 内容非法

   * 预期：报错
5. structured output 返回成功

   * 预期：输出合法结构化结果

---

## 13. 风险

* 会改变已有 `--json` 用户习惯
* 旧测试可能基于“JSON 打印”思路，需要改

---

## 14. 回滚方案

如果 structured output 路径接入失败：

1. 暂时保留 `--json` 但在 help/README 中降级描述为“JSON 输出格式”
2. 新增 `--structured-json` 作为实验参数
   不过这不是首选，首选仍是直接修正 `--json` 的真实语义。

---

## 15. Definition of Done

* `--json` 真正等于 structured output
* `--schema-file` 可用
* 示例 schema 存在
* 测试通过
* README 与实际行为一致

---

# 子 PRD-D：会话配置与响应解析语义对齐

## 1. 背景

当前 CLI 暴露了如 `agent`、`model` 等配置能力，但其真实生效位置和生效方式可能不清晰。同时 response 解析层已有基础归一化，但兼容边界尚未正式定义，存在过度猜测 SDK 结构或参数“看起来支持但没真正生效”的风险。

---

## 2. 目标

本子 PRD 的目标是：

1. 对齐 session 相关配置的真实行为
2. 收口 `agent / model / permissions` 语义
3. 重构 response 解析层，使其兼容边界清晰
4. 让业务层不再直接依赖 SDK 原始结构细节

---

## 3. 范围

### 3.1 包含内容

* `SessionConfig` 收口
* `agent / model / permissions` 作用点对齐
* response 解析拆小函数
* structured output / error 提取收口
* 测试补齐
* README/help 中参数语义修正

### 3.2 不包含内容

* SDK 路线决策
* `--json` schema 文件机制
* signal 修复
* CI 配置

---

## 4. 问题定义

当前问题有两类：

### 4.1 Session 语义问题

* 参数存在，但实际不一定生效
* 用户可能误解 `agent` 或 `model` 的生效位置

### 4.2 Response 语义问题

* 兼容层边界未明
* 可能既不够稳，也可能写得过宽

---

## 5. 目标用户/受益方

* CLI 用户：参数语义更清楚
* 开发者：更容易维护 SDK 适配层
* QA：更容易断言 structured output、错误对象和普通文本响应

---

## 6. 依赖关系

### 6.1 前置依赖

强依赖子 PRD-B。
建议在子 PRD-C 的 structured output 行为基本定型后再收口。

### 6.2 后置依赖

会影响子 PRD-E 的文档和测试收尾。

---

## 7. 设计约束

### 7.1 Session 配置约束

1. 参数存在，就必须有明确作用
2. 如果某参数只用于校验、不真正传给 session/create 或 prompt，必须写清楚
3. 当前不支持的配置不要静默接受

### 7.2 Response 兼容约束

兼容边界只允许覆盖：

1. 当前项目实际在使用的结构
2. 当前锁定 SDK 版本的已知结构
3. 当前文档与实现之间必要的一层字段差异

不允许写成“无限制万能兼容器”。

---

## 8. 设计要求

### 8.1 Session 侧

需要明确：

* `model` 是作用于 session.create、prompt，还是仅作用于 prompt
* `agent` 是真正传给 SDK 还是只做预检/校验
* `permissions` 当前是否支持；若不支持，移除或显式说明

### 8.2 Response 侧

需要拆成小函数，例如：

* 获取根对象
* 获取 `info`
* 获取 `parts`
* 提取 text
* 提取 structured output
* 提取 error

---

## 9. 交付物

必须交付：

* `src/opencode.ts`：session 语义收口
* `src/response.ts`：重构
* `test/opencode.test.ts`
* `test/response.test.ts`
* README/help 参数说明更新

---

## 10. 验收标准

### 10.1 功能验收

* `model` 的生效点清楚
* `agent` 的行为清楚
* 不支持的参数不会被误导性暴露
* response 解析能正确处理普通文本、structured output、错误对象

### 10.2 质量验收

* 业务层不再直接猜 SDK 返回结构
* 每个兼容分支都能解释“为什么存在”

---

## 11. 测试要求

至少补这些测试：

1. `model` 参数被正确消费
2. `agent` 参数要么真正生效，要么明确是预检行为
3. 普通文本响应提取
4. structured output 提取
5. error message 提取
6. 缺失字段时安全返回 null/空结果

---

## 12. 风险

* 如果兼容层写太宽，会提高复杂度
* 如果 session 行为说明不统一，文档会继续误导用户

---

## 13. 回滚方案

如果 response 重构引发大面积不稳定：

1. 保留新的小函数结构
2. 先只兼容当前主路径
3. 暂时去掉非必要兼容分支
4. 用测试锁定当前必须支持的结构

---

## 14. Definition of Done

* SessionConfig 语义清晰
* response 解析边界清晰
* 参数行为不再误导
* 测试覆盖关键结构

---

# 子 PRD-E：文档、测试与基础 CI 收敛

## 1. 背景

在当前 MVP 中，README、CLI help、测试和真实代码行为之间仍可能存在偏差。同时，如果没有基础 CI 保障，后续每一轮修复都容易发生回归。

---

## 2. 目标

本子 PRD 的目标是：

1. 让 README 与 help 与真实行为一致
2. 把测试重点从“数量”转成“关键场景覆盖”
3. 建立最小可用的 GitHub Actions CI
4. 将 `typecheck` 和 `test` 纳入标准交付链路

---

## 3. 范围

### 3.1 包含内容

* README 收口
* help 文案对齐
* 测试补齐与整理
* GitHub Actions 基础 CI
* 如无稳定 coverage 基线，则建立 baseline 说明

### 3.2 不包含内容

* signal 修复主体
* SDK 路线决策
* structured output 主体开发
* response 兼容层重构

---

## 4. 问题定义

当前主要问题：

* README 和代码行为可能不完全一致
* help 可能继续描述“看起来支持但未真正生效”的参数
* 测试强调数量，但不一定强调关键风险场景
* 无基础 CI 时，修复容易回归

---

## 5. 目标用户/受益方

* 最终使用者：文档可信
* 开发者：本地和 CI 行为一致
* QA：有明确的测试重点
* review agent：更容易做最终合规判断

---

## 6. 依赖关系

### 6.1 前置依赖

依赖：

* 子 PRD-A 的 cleanup 行为定型
* 子 PRD-B 的 SDK 版本和路线定型
* 子 PRD-C 的 `--json` 行为定型
* 子 PRD-D 的参数和 response 语义定型

### 6.2 后置依赖

无。

本子 PRD 主要负责最后收口。

---

## 7. 设计约束

1. README、help、测试、代码必须一致
2. CI 只做基础版，不做复杂发布流程
3. 如果当前没有稳定 coverage baseline，不强行上阈值门槛
4. 测试必须围绕关键场景，而不是追求数量

---

## 8. 测试策略要求

### 8.1 单元测试

适合 mock：

* CLI 参数解析
* prompt 文件校验
* response 提取

### 8.2 SDK 适配测试

适合 mock SDK：

* attach 成功
* attach 失败 spawn
* create/prompt/abort/delete
* keep-session 行为

### 8.3 关键集成测试

视环境可选：

* structured output 真正调用
* timeout 后 cleanup
* signal 中断 cleanup

---

## 9. 必补测试场景

至少明确覆盖这些：

1. `--json --schema-file` 成功
2. `--json` 无 schema 报错
3. attach 失败自动 spawn
4. keep-session 时不 delete
5. timeout 后 abort + cleanup
6. signal 中断时 cleanup
7. response 关键分支解析

---

## 10. CI 要求

建议新增：

```text id="p8qnbi"
.github/workflows/ci.yml
```

至少执行：

* install
* typecheck
* test

### 不强制纳入本轮

* 自动发布
* 多平台矩阵
* 覆盖率阈值硬限制

如果已有 coverage 体系，可加“不低于当前 baseline”；
如果没有，则本轮先建立 baseline 说明即可。

---

## 11. 交付物

必须交付：

* 更新后的 `README.md`
* 对齐后的 help 文案
* 测试补齐/整理
* `.github/workflows/ci.yml`
* 如有需要，coverage baseline 说明

---

## 12. 验收标准

### 12.1 功能验收

* README、help、代码行为一致
* CI 在 GitHub 上能跑通
* `typecheck` 和 `test` 成为标准校验项

### 12.2 质量验收

* 文档不会误导用户
* 测试能证明关键风险已被覆盖
* 后续修复更容易做回归

---

## 13. 风险

* CI 加入后可能暴露已有隐患
* 如果仓库还没有稳定的测试边界，第一次 CI 可能会失败较多
* README 收口时需要等待其他子 PRD 基本定型

---

## 14. 回滚方案

如果 CI 引入后影响本轮合并：

1. 保留 workflow 文件
2. 先只执行 install + typecheck
3. 把不稳定集成测试暂时标记为可选或跳过
4. 待后续稳定后再恢复全量 test

---

## 15. Definition of Done

* README、help、代码一致
* 关键测试场景明确覆盖
* GitHub Actions 基础 CI 建立
* `typecheck` / `test` 进入标准交付流程

---

如果你要，我下一条可以继续把这 5 个子 PRD 再压缩成 **5 段可直接投喂给 agent 的任务提示词**，每个 agent 一段，直接开工。
