# OpenCode SDK CLI

基于 TypeScript + ts-node 的 OpenCode SDK CLI 工具。

## 快速开始

```bash
cd /root/projects/codingagentteams/app2
npm install
```

## 运行

```bash
# 直接执行任务
node --loader ts-node/esm run.ts "你的任务描述"

# 查看帮助
node --loader ts-node/esm run.ts --help
```

## 常用参数

```bash
# 指定模型
node --loader ts-node/esm run.ts --model openai/gpt-4 "分析这段代码"

# 开启调试输出
node --loader ts-node/esm run.ts --debug "检查资源泄露"

# JSON 结构化输出
node --loader ts-node/esm run.ts --json "提取结构化字段"

# 设置超时（毫秒）
node --loader ts-node/esm run.ts --timeout 30000 "长时间任务"

# 连接指定服务器
node --loader ts-node/esm run.ts --host 10.0.0.1 --port 8080 "任务"

# 保留 session 不删除
node --loader ts-node/esm run.ts --keep-session "任务"

# 指定 agent 类型
node --loader ts-node/esm run.ts --agent coder "编码任务"

# 使用自定义 prompt 模板
node --loader ts-node/esm run.ts --prompt my-prompt.md "任务"

# 参数终止符 -- （后面的都当输入）
node --loader ts-node/esm run.ts -- --not-a-flag
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENCODE_MODEL` | 默认模型 |
| `OPENCODE_HOST` | 服务器地址 |
| `OPENCODE_PORT` | 服务器端口 |
| `OPENCODE_PROMPT` | prompt 模板路径 |
| `OPENCODE_TIMEOUT_MS` | 超时时间 |
| `OPENCODE_MAX_INPUT_LENGTH` | 最大输入长度 |

优先级：CLI 参数 > 环境变量 > 默认值

## 项目结构

```
app2/
├─ prompt.md              # 默认 prompt 模板
├─ run.ts                 # 入口文件
├─ src/
│  ├─ cli.ts             # CLI 参数解析
│  ├─ config.ts          # 配置加载（CLI > env > default）
│  ├─ errors.ts          # 错误类型与退出码
│  ├─ logger.ts          # 日志
│  ├─ main.ts            # 业务编排（两段式注入、cleanup）
│  ├─ opencode.ts        # SDK 适配层（attach/spawn/session）
│  ├─ prompt.ts          # prompt 文件读取与校验
│  └─ response.ts        # 响应归一化（text/structured/error）
└─ test/
   ├─ cli.test.ts
   ├─ config.test.ts
   ├─ errors.test.ts
   ├─ logger.test.ts
   ├─ main.test.ts
   ├─ opencode.test.ts
   ├─ prompt.test.ts
   └─ response.test.ts
```

## 开发命令

```bash
# 类型检查
npx tsc --noEmit

# 运行测试（105 个测试）
node --loader ts-node/esm --test test/*.test.ts
```

## 工作流程

1. 解析 CLI 参数
2. 加载配置（CLI > 环境变量 > 默认值）
3. 读取并校验 prompt.md 模板
4. 尝试 attach 到已有 OpenCode 服务器（health check）
5. attach 失败则自动 spawn 新服务器
6. 校验 agent 类型（如果指定 `--agent`）
7. 创建 session
8. **第一阶段**：`noReply: true` 注入 prompt 模板
9. **第二阶段**：发送用户任务
10. 归一化响应，输出结果
11. 清理：abort session → delete session（除非 `--keep-session`）→ close server（如果 spawn）

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 服务器/会话错误 |
| 2 | 输入/配置/prompt 文件错误 |
| 3 | 超时 |
| 130 | 用户中断（Ctrl+C） |
