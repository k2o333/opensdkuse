# 子 PRD-D：会话配置与响应解析语义对齐

## 1. 背景

当前 CLI 暴露了如 `agent`、`model` 等配置能力，但其真实生效位置和生效方式可能不清晰。同时 response 解析层已有基础归一化，但兼容边界尚未正式定义，存在过度猜测 SDK 结构或参数"看起来支持但没真正生效"的风险。

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

不允许写成"无限制万能兼容器"。

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
* 每个兼容分支都能解释"为什么存在"

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
