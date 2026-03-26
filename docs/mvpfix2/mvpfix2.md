# opensdkuse 剩余修复执行文档（给主 coding agent）

## 1. 文档目的

这份文档不是评审意见汇总，而是**可直接执行的开发计划**。
目标是把当前仓库从“核心主线已补上，但仍有尾项未收口”的状态，推进到“可放心交付的 MVP”。

本文档面向：

* **主 agent（Coordinator / Integrator）**：负责任务拆分、接口边界定义、分支集成、冲突消解、最终验收
* **subagent-A（Runtime & Response）**：负责运行时行为、response 兼容与机器可读输出
* **subagent-B（CLI & Config）**：负责 CLI 参数、timeout 语义、agent 校验策略
* **subagent-C（Docs & Tests）**：负责 README/help/test 补齐与一致性验证

---

## 2. 当前状态摘要（基于当前仓库现状）

### 已经基本完成

1. signal handler 具名注册 / 正确解绑
2. SDK 路线已明确：继续沿用当前 v2 风格适配
3. SDK 版本已锁定
4. `--json + --schema-file` 已经走真正 structured output
5. `model` / `agent` 的作用点已基本澄清
6. 版本矩阵已补入 README

### 仍未完全收口

1. response 兼容边界还不完整
2. timeout 仍是单一语义，未拆分
3. agent 校验失败缺少“可见策略”与 strict 模式
4. README / help / 测试还没有完全覆盖所有剩余行为差异
5. `--json` 下机器可读输出格式还不完整
6. README 缺少明确的“已知限制”章节
7. 某些关键测试仍缺位（如 keep-session 明确行为、response 差异字段兼容）

---

## 3. 本轮目标与非目标

## 3.1 本轮目标

把当前剩余 gap 收敛成一组：

* 行为清晰
* 配置语义清晰
* 输出格式清晰
* 文档与测试一致
* 可稳定回归

## 3.2 本轮非目标

本轮明确不做：

* 不新增 subagent orchestration 能力
* 不做多 provider fallback
* 不做复杂 CLI 扩容
* 不做“兼容未来所有未知 SDK 返回结构”的大一统抽象
* 不做 SDK 路线切换（本轮继续沿用当前已锁定路线）

---

## 4. 总执行策略

### 4.1 总原则

按下面顺序推进：

1. 先定义边界，避免并行开发互相打架
2. 再做可并行部分
3. 最后由主 agent 集成与统一验收

### 4.2 并行原则

可以并行，但前提是：

* 接口先定
* 字段名先定
* 输出契约先定
* 文档口径先定

否则会出现：

* Runtime 分支改了字段
* CLI 分支改了参数
* Docs/Test 分支按旧口径写
* 最后合不拢

### 4.3 主 agent 先做的事

主 agent 在任何 subagent 开发前，必须先冻结以下契约：

1. response 兼容边界
2. `--json` 机器可读输出格式
3. timeout 新字段命名与旧参数兼容策略
4. agent 校验失败时的默认行为与 strict 行为
5. README/help 最终口径

这些契约冻结后，再开始并行开发。

---

## 5. 剩余任务总表

| 编号 | 任务                 |      优先级 |         可并行 | 主要负责人                |
| -- | ------------------ | -------: | ----------: | -------------------- |
| T1 | 收敛 response 兼容边界   |       P0 |    否（先定义接口） | 主 agent + subagent-A |
| T2 | 完善 response 解析实现   |       P0 |           是 | subagent-A           |
| T3 | 设计统一机器可读 JSON 输出   |       P0 |    否（先定义契约） | 主 agent + subagent-A |
| T4 | 拆分 timeout 语义      |       P1 |           是 | subagent-B           |
| T5 | agent 校验失败改为可见策略   |       P1 |           是 | subagent-B           |
| T6 | README/help 对齐剩余行为 |       P1 | 依赖 T3/T4/T5 | subagent-C           |
| T7 | 补关键回归测试            |       P1 |       部分可并行 | subagent-C           |
| T8 | README 增加已知限制      |       P2 |       依赖 T6 | subagent-C           |
| T9 | 全量集成、冲突消解、验收       | P0/P1 汇总 |           否 | 主 agent              |

---

## 6. 依赖关系图

## 6.1 高层依赖

```text
T1 定义 response 兼容边界
  -> T2 response 实现
  -> T7 response 测试

T3 定义机器可读 JSON 输出契约
  -> T2 输出实现
  -> T6 README/help 对齐
  -> T7 JSON 输出测试

T4 timeout 语义拆分
  -> T6 README/help 对齐
  -> T7 timeout 测试

T5 agent 可见策略
  -> T6 README/help 对齐
  -> T7 agent 测试

T2/T4/T5 完成
  -> T6/T7

T6/T7 完成
  -> T8 已知限制整理
  -> T9 最终验收
```

## 6.2 关键结论

* **T1 和 T3 必须先由主 agent 定口径**，否则并行开发会反复返工
* **T4 和 T5 可以并行**
* **T6 和 T7 不能太早开工**，否则文档和测试会按旧行为写

---

## 7. 主 agent 职责（调度者）

主 agent 不应陷入所有代码细节，而应承担以下职责：

### 7.1 设计冻结

在开发开始前产出一页“冻结说明”，至少明确：

#### A. response 兼容边界

只兼容以下字段：

* structured：

  * `info.structured`
  * `info.structured_output`
* error：

  * `info.error.message`
  * `info.error.data?.message`
* text：

  * 仅从已知 `parts` 结构提取

不兼容未来未知字段，不做无限泛化。

#### B. `--json` 机器可读输出契约

建议最终统一输出：

```json
{
  "mode": "structured" | "text" | "error",
  "sessionId": "string | null",
  "result": {},
  "text": "string | null",
  "error": {
    "message": "string"
  } | null
}
```

建议约束：

* structured 成功时：

  * `mode = "structured"`
  * `result = structured object`
  * `text = null`
  * `error = null`
* 普通文本模式下如果仍走 `--json` 包装：

  * `mode = "text"`
  * `result = null`
  * `text = extracted text`
* 错误时：

  * `mode = "error"`
  * `error.message` 必填

> 注：如果产品决定 `--json` 只服务 structured output，则普通文本可不走 `mode=text`，但需要主 agent 明确冻结该约束。

#### C. timeout 语义

建议新增内部配置字段：

* `serverStartupTimeoutMs`
* `executionTimeoutMs`

CLI 兼容策略建议：

* 保留现有 `--timeout`，但标记为“execution timeout” 或 deprecated
* 新增：

  * `--server-startup-timeout`
  * `--execution-timeout`

如果为了控制改动范围不想扩 CLI，可采用：

* 当前轮内部先拆分配置
* CLI 暂时只暴露 `--timeout` -> `executionTimeoutMs`
* `serverStartupTimeoutMs` 走配置默认值

主 agent 必须先冻结采用哪种方案。

#### D. agent 校验失败策略

建议冻结为：

* 默认模式：

  * 若 agent API 可用且 agent 不存在 -> 直接报错
  * 若 agent API 不可用 / 校验失败 -> 输出 warning，但继续
* strict 模式：

  * 增加 `--strict-agent`
  * 一旦 agent 无法确认存在，则报错退出

### 7.2 分支协作

主 agent 负责：

1. 为每个 subagent 指定单独分支
2. 定义禁止修改区域，减少冲突
3. 统一合并顺序
4. 在集成分支跑 typecheck/test

### 7.3 最终验收

主 agent 对每个任务不只看“代码改了没”，还要看：

* 是否真的改变行为
* README/help 是否同步
* 测试是否覆盖核心路径
* 是否引入更宽更模糊的兼容逻辑

---

## 8. subagent-A：Runtime & Response

## 8.1 目标

收敛 response 解析与 `--json` 输出，使运行时层行为可预测、可测试、可文档化。

## 8.2 负责任务

* T1：协助主 agent 收敛 response 兼容边界
* T2：实现 response 解析重构补齐
* T3：协助主 agent 完成 JSON 输出契约落地

## 8.3 修改范围

优先限定在：

* `src/response.ts`
* `src/opencode.ts`
* 如必要，少量改 `src/main.ts`

尽量不要主动修改：

* `src/cli.ts`
* README
* 大量测试命名

### 8.4 实施清单

#### T2-1. 收敛 structured 字段兼容

把 structured 提取逻辑限制在：

* `info.structured`
* `info.structured_output`

要求：

* 只支持这两个
* 读取不到时返回 `null`
* 不抛异常

#### T2-2. 收敛 error 字段兼容

支持：

* `info.error.message`
* `info.error.data?.message`

要求：

* 未命中返回 `null`
* 不扩展到更多未知层级

#### T2-3. 明确 text 提取路径

要求：

* 只从当前项目已使用的已知 `parts` 结构提取
* `parts` 缺失时返回空字符串或 `null`（由主 agent 先定）
* 不得崩溃

#### T2-4. 统一 JSON 输出 helper

新增或改造统一 helper，例如：

* `formatMachineReadableOutput(...)`

要求：

* 统一输出 `mode/sessionId/result/text/error`
* structured 与 error 分支格式固定
* 避免业务层自己拼 JSON

#### T2-5. 确保业务层只消费抽象结果

要求：

* `main.ts` 或上层逻辑不再直接猜 response 原始结构
* 所有 SDK 差异都收敛在 `response.ts`

### 8.5 风险

* 如果兼容分支写太多，会重新把边界做宽
* 如果输出 helper 同时承担解析 + 格式化，会让职责混乱

### 8.6 完成标准

* response 解析只保留明确列出的兼容边界
* 业务层不直接猜字段
* `--json` 输出格式固定可预期
* 不因字段缺失而崩溃

### 8.7 交付给主 agent 的产物

1. 变更说明：兼容了哪些字段，为什么
2. 受影响函数列表
3. 新旧输出示例
4. 建议补的测试点列表

---

## 9. subagent-B：CLI & Config

## 9.1 目标

把 CLI 和配置层从“看起来支持”修正为“语义清晰、行为可见”。

## 9.2 负责任务

* T4：拆分 timeout 语义
* T5：agent 校验失败改为可见策略

## 9.3 修改范围

优先限定在：

* `src/cli.ts`
* `src/config.ts`
* `src/main.ts`
* 少量 `src/opencode.ts`

尽量不要主动修改：

* `src/response.ts`
* README 大段正文（交给 subagent-C）

## 9.4 实施清单

#### T4-1. 定义 timeout 新结构

在配置层拆分为：

* `serverStartupTimeoutMs`
* `executionTimeoutMs`

要求：

* 命名清晰
* 默认值明确
* 旧字段若保留，必须标明映射关系

#### T4-2. 调整 runtime 消费点

要求：

* attach/spawn/server ready 相关逻辑使用 `serverStartupTimeoutMs`
* 实际 prompt 执行 / session 运行使用 `executionTimeoutMs`
* 避免一个 timeout 同时控制两个语义

#### T4-3. CLI 参数策略

根据主 agent 冻结方案实现：

方案 A：完全暴露新参数

* `--server-startup-timeout`
* `--execution-timeout`
* 旧 `--timeout` deprecated

方案 B：最小改动

* `--timeout` 仅绑定 `executionTimeoutMs`
* startup timeout 走内部默认值

subagent-B 不要自行拍板，必须遵循主 agent 方案。

#### T5-1. agent 校验默认可见策略

要求：

* 当 agent API 不可用或校验失败时，默认输出 warning
* warning 文案清楚：

  * 是“未能验证”
  * 不是“验证通过”

#### T5-2. 增加 strict 模式

建议新增：

* `--strict-agent`

要求：

* 严格模式下，无法确认 agent 可用则报错退出
* 非严格模式下，只 warning 并继续

#### T5-3. 避免误导性描述

要求：

* CLI help 与错误信息不能暗示 agent 一定已生效
* 与 `model` 行为说明保持一致：谁是真生效，谁是预校验

### 9.5 风险

* timeout 改动容易牵扯测试与文档大量同步
* strict-agent 如果文案不清，用户会误解默认行为

### 9.6 完成标准

* timeout 两种语义明确分离
* agent 校验失败对用户可见
* strict 模式行为明确
* 没有“参数存在但用户不知道是否生效”的歧义

### 9.7 交付给主 agent 的产物

1. 新旧 CLI 参数对照表
2. timeout 流程图
3. warning / error 文案列表
4. 需要同步 README/help 的点

---

## 10. subagent-C：Docs & Tests

## 10.1 目标

把“已经改过的行为”和“本轮新增的剩余修复”都完整反映到 README/help/test，避免再次出现代码领先文档、文档领先测试的情况。

## 10.2 负责任务

* T6：README/help 全面对齐剩余行为
* T7：补关键回归测试
* T8：README 增加已知限制

## 10.3 修改范围

优先限定在：

* `README.md`
* `test/*.test.ts`
* 必要时少量同步 CLI help 文案

不要主动重写：

* `src/response.ts` 核心逻辑
* `src/config.ts` 结构定义

## 10.4 实施清单

#### T6-1. README 对齐 `--json`

明确写清：

* `--json` 是 structured output 入口
* 必须配合 `--schema-file`
* schema 文件需要是合法 JSON Schema 对象
* 输出格式的统一字段定义

#### T6-2. README/help 对齐 timeout

明确写清：

* startup timeout 是什么
* execution timeout 是什么
* CLI 暴露了哪些参数
* 如果保留旧参数，兼容关系是什么

#### T6-3. README/help 对齐 agent

明确写清：

* `--agent` 当前是否只做预校验
* 失败时默认 warning 还是 error
* `--strict-agent` 行为

#### T6-4. README/help 对齐 keep-session

明确写清：

* `--keep-session` 时不会 delete session
* 哪些 cleanup 仍会执行

#### T8-1. README 增加“已知限制”

至少包含：

1. 当前采用的 SDK 路线与版本绑定
2. structured output 依赖 schema
3. 当前多 agent 只是提示词/规则层，不是原生 orchestration
4. attach 优先、attach 失败后再 spawn
5. response 只兼容当前列出的有限字段差异

#### T7-1. 补 response 兼容测试

至少覆盖：

* `info.structured`
* `info.structured_output`
* `info.error.message`
* `info.error.data.message`
* parts 缺失时不崩溃

#### T7-2. 补 `--json` 输出测试

至少覆盖：

* structured 成功时统一 JSON 结构
* 错误时统一 JSON 结构
* sessionId 是否按约定输出

#### T7-3. 补 keep-session 测试

明确断言：

* `--keep-session` 时不 delete
* 非 keep-session 时 delete 被调用

#### T7-4. 补 timeout 测试

如果 timeout 被拆分，至少覆盖：

* server 启动慢触发 startup timeout
* 执行时间过长触发 execution timeout
* abort / cleanup 顺序正确

#### T7-5. 补 agent 策略测试

至少覆盖：

* 默认模式下校验不可用 -> warning + 继续
* strict 模式下校验失败 -> 报错
* agent 不存在 -> 报错

### 10.5 风险

* 如果在代码行为冻结前先写文档和测试，会反复返工
* 如果测试只测“有输出”而不测“字段契约”，仍然不能证明问题修好了

### 10.6 完成标准

* README/help/代码/测试四者口径一致
* 测试覆盖关键风险，而不是只增加数量
* 已知限制写明，不误导用户

### 10.7 交付给主 agent 的产物

1. README 变更摘要
2. 新增测试清单
3. 剩余未覆盖风险列表
4. 手工回归建议命令

---

## 11. 推荐并行开发排期

## 阶段 0：主 agent 先冻结契约（必须先做）

主 agent 产出并确认：

1. response 兼容字段白名单
2. JSON 输出统一契约
3. timeout 拆分方案
4. agent 默认/strict 行为
5. CLI 暴露策略

这一步结束后，才允许 subagent 并行。

---

## 阶段 1：并行开发（可同时开始）

### subagent-A 开始

* 实现 response 兼容收敛
* 实现统一 JSON 输出 helper

### subagent-B 开始

* 拆分 timeout 配置与消费点
* 增加/调整 agent warning 与 strict 模式

### subagent-C 暂不全面开工

只允许先准备测试骨架和 README 待填区块，不要先写死最终文案。

---

## 阶段 2：接口合并后再并行

当前置实现初步稳定后：

### subagent-C 开始正式补文档与测试

* 补 response 兼容测试
* 补 timeout/agent/keep-session 测试
* 更新 README/help
* 新增已知限制章节

### subagent-A / B 只做 review support

* 响应测试失败
* 修小范围行为偏差

---

## 阶段 3：主 agent 集成

主 agent 负责：

1. 合并 subagent-A 分支
2. 合并 subagent-B 分支
3. 解决冲突
4. 再合并 subagent-C 分支
5. 跑全量验证
6. 修最终收尾

---

## 12. 文件级所有权建议

为减少冲突，建议临时约定文件所有权：

### 主 agent

* 最终集成分支
* 架构决策文档
* cross-file 冲突解决

### subagent-A

主改：

* `src/response.ts`
* `src/opencode.ts`

可少量改：

* `src/main.ts`

### subagent-B

主改：

* `src/config.ts`
* `src/cli.ts`
* `src/main.ts`

可少量改：

* `src/opencode.ts`

### subagent-C

主改：

* `README.md`
* `test/*.test.ts`

可少量改：

* `src/cli.ts`（仅 help 文案）

### 冲突高发文件

* `src/main.ts`
* `src/opencode.ts`
* `src/cli.ts`

这些文件如果多人都要动，必须由主 agent 先切分修改边界。

---

## 13. 每项任务的验收标准

## T1/T2：response 与输出

验收标准：

* 解析逻辑只兼容白名单字段
* 缺字段时不崩溃
* 统一 JSON 输出字段稳定
* 上层业务不直接猜 SDK 原始结构

## T4：timeout

验收标准：

* 启动超时与执行超时语义分离
* CLI / config / runtime 三层一致
* 测试能分别证明两种 timeout

## T5：agent 策略

验收标准：

* 用户明确知道 agent 是否已被验证
* 默认模式与 strict 模式行为不同且可预测
* 文案不误导

## T6/T8：README/help/限制

验收标准：

* README/help/代码一致
* 已知限制明确
* 没有“看起来支持、实际没生效”的描述

## T7：测试

验收标准：

* 覆盖关键风险点
* 不再用“测试数量”代替“行为证明”

---

## 14. 必跑回归清单

主 agent 在集成后必须验证：

### 命令级验证

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

5. execution timeout

```bash
npm run dev -- --timeout 1 "long task"
```

6. strict agent

```bash
npm run dev -- --agent some-agent --strict-agent "hello"
```

7. Ctrl+C 中断

* 任务执行时手动中断
* 验证 abort / cleanup / exit code

### 自动化验证

必须通过：

```bash
npm test
npm run typecheck
```

如果仓库有 lint，也应补跑：

```bash
npm run lint
```

---

## 15. 建议交付节奏

### 第一批交付（主干功能）

* T1
* T2
* T3
* T4
* T5

### 第二批交付（一致性）

* T6
* T7
* T8

### 第三批交付（集成验收）

* T9

> 不建议 Docs/Test 先于 Runtime/CLI 最终行为冻结完成，否则会反复返工。

---

## 16. 给主 coding agent 的最终执行指令

你作为主 coding agent，不要一上来就改代码。请先完成以下动作：

1. 冻结四个契约：

   * response 兼容字段白名单
   * `--json` 统一输出格式
   * timeout 拆分策略
   * agent 默认/strict 策略
2. 按文件所有权拆给三个 subagent
3. 允许 subagent-A 与 subagent-B 并行
4. 等 A/B 契约基本稳定后，再让 subagent-C 正式补 README/help/test
5. 最后统一集成，跑 typecheck/test/手工回归

### 主 agent 的核心原则

* 先定边界，再并行
* 先修真实行为，再补文档测试
* 不做超出当前 SDK 路线的泛化抽象
* 不接受“参数看起来支持，但实际上未生效”
* 不接受“文档说一套、代码做一套、测试测另一套”

---

## 17. 一句话总结

本轮不是继续扩功能，而是把剩余 gap **收口成清晰边界、清晰契约、清晰测试和清晰文档**。主 agent 先冻结接口与策略，subagent-A / B 并行实现，subagent-C 在接口稳定后补文档与验证，最后统一集成验收。
