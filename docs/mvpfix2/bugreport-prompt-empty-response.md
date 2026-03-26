# Bug Report: `--prompt` 参数导致模型返回空内容

## Bug 概述

使用 `--prompt` 参数加载自定义 prompt 文件时，OpenCode 模型返回 `[No text content returned from model]`，任务卡住无输出。

## 复现步骤

1. 准备一个自定义 prompt 文件（如 `prompts/plan.md`），设定特定角色
2. 执行命令：
   ```bash
   node --loader ts-node/esm run.ts --prompt /home/quan/proj/opensdkuse/prompts/plan.md "任务"
   ```
3. 观察输出：显示 `[No text content returned from model]` 后无进一步响应

## 预期行为

模型应正常返回内容，无论是否使用 `--prompt`。

## 实际行为

- 不带 `--prompt` 的命令可以正常工作：
  ```bash
  node --loader ts-node/esm run.ts "你的任务描述"
  ```
- 带 `--prompt` 的命令返回空内容并卡住

## 根因分析

### 问题定位

`prompt.md`（默认系统指令）与用户通过 `--prompt` 指定的文件**同时注入**产生了角色冲突：

- `prompt.md`：设定 agent 为 "coding assistant"
- `prompts/plan.md`：设定 agent 为 "专业的产品经理"

两套角色指令互相矛盾，导致模型无法确定应该扮演什么角色，返回空内容。

### 技术细节

1. 默认的 `prompt.md` 作为系统指令始终注入
2. `--prompt` 参数会追加用户自定义的 prompt 文件内容
3. 当两者角色设定冲突时，模型行为不可预测

## 影响范围

- 所有使用 `--prompt` 参数的场景
- 特别是当自定义 prompt 文件设定了与默认 `prompt.md` 不同的角色时

## 建议修复方向

1. **方案A：禁止同时注入**
   - 使用 `--prompt` 时，替换而非追加默认 `prompt.md`
   - 需要 CLI 参数语义变更

2. **方案B：自动合并角色**
   - 检测角色冲突时，进行自动合并或优先级处理
   - 需要在 prompt 注入层实现

3. **方案C：明确错误提示**
   - 当检测到角色冲突时，输出明确错误而非静默返回空
   - 帮助用户理解问题并手动解决

## 附加信息

- OpenCode server 版本：1.3.2
- 问题首次发现时间：2026-03-27
- 相关文件：
  - `/home/quan/proj/opensdkuse/prompt.md`（默认系统指令）
  - `/home/quan/proj/opensdkuse/prompts/plan.md`（测试用自定义 prompt）
  - `src/cli.ts`（参数解析）
  - `src/main.ts`（prompt 注入逻辑）