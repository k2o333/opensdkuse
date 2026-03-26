# 子 PRD-A：运行时稳定性与清理链路修复

## 1. 背景

当前 MVP 已实现基本的 timeout、signal、cleanup 机制，但运行时存在一个高优先级稳定性问题：`SIGINT` / `SIGTERM` 的监听器注册与解绑实现存在风险，可能造成监听器泄漏、测试环境污染、重复触发 abort/cleanup、以及多次执行时的非预期副作用。

这类问题虽然不直接影响主功能是否"能跑"，但会持续影响后续测试、回归和并行开发，因此必须优先修复。

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
