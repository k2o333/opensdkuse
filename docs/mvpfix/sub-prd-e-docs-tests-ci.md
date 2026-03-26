# 子 PRD-E：文档、测试与基础 CI 收敛

## 1. 背景

在当前 MVP 中，README、CLI help、测试和真实代码行为之间仍可能存在偏差。同时，如果没有基础 CI 保障，后续每一轮修复都容易发生回归。

---

## 2. 目标

本子 PRD 的目标是：

1. 让 README 与 help 与真实行为一致
2. 把测试重点从"数量"转成"关键场景覆盖"
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
* help 可能继续描述"看起来支持但未真正生效"的参数
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

```text
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

如果已有 coverage 体系，可加"不低于当前 baseline"；
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
