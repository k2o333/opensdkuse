# subagent-A 任务文档：Runtime & Response

## 你的角色

你是 **subagent-A**，负责运行时 response 解析与 `--json` 机器可读输出。
任务文档在 `docs/mvpfix2/task-agent-A.md`，请完整阅读后再动手。

## 代码库信息

- 项目根目录：`/home/quan/proj/opensdkuse`
- 你的主战场：`src/response.ts`、`src/opencode.ts`、`src/main.ts`（少量）
- 你可以建议测试，但不自己写测试文件

## 禁区（不要主动修改）

- `src/cli.ts`
- `src/config.ts`
- `README.md`
- `test/*.test.ts`

## 冻结契约（主 agent 已确认，你只需执行）

### A. response 兼容边界

- **structured**：只认 `info.structured`，不兼容 `info.structured_output`
- **error**：兼容 `info.error.data?.message`（优先）和 `info.error.message`（fallback）
- **text**：只从 `parts` 中 `type === "text"` 提取，缺失返回 `null`

### B. `--json` 机器可读输出格式

```json
{
  "mode": "structured" | "text" | "error",
  "sessionId": "string | null",
  "result": {},
  "text": "string | null",
  "error": { "name": "string", "message": "string", "retries": "number" } | null
}
```

规则：
- **error 优先**：有 error 时 `mode = "error"`，无论是否有 structured/text
- **structured 次之**：有 `structuredOutput` 且无 error 时 `mode = "structured"`
- **text 兜底**：只有 text 时 `mode = "text"`
- `sessionId` 从 `normalized.info?.sessionID` 取
- `result` 只在 `mode = "structured"` 时有值，否则 `null`
- `text` 只在 `mode = "text"` 时有值，否则 `null`

---

## T2：完善 response 解析实现

### T2-1. 确认 structured 兼容范围

当前 `extractStructuredOutputFromInfo`（`src/response.ts:69-71`）只读 `info?.structured`，返回 `null` 不抛异常。

**动作**：确认实现正确，无需修改。如果发现任何其他路径读取了 `structured_output`，删除它。

### T2-2. 收敛 error 字段提取

当前 `extractErrorFromInfo`（`src/response.ts:73-80`）只从 `info.error.data?.message` 提取。

**需要改动**：

1. 更新 `AssistantInfo` 接口（`src/response.ts:17-27`），让 `error` 同时支持直接 `message` 字段：

```typescript
error?: {
  name: string;
  message?: string;  // 新增：直接在 error 上的 message
  data?: { message?: string; retries?: number; [key: string]: unknown };
};
```

2. 修改 `extractErrorFromInfo`：

```typescript
function extractErrorFromInfo(info: AssistantInfo | null): { name?: string; message?: string; retries?: number } | null {
  if (!info?.error) return null;
  return {
    name: info.error.name,
    message: info.error.data?.message ?? info.error.message,  // 优先 data.message，fallback error.message
    retries: info.error.data?.retries,
  };
}
```

3. 不扩展到更多未知层级。

### T2-3. 确认 text 提取路径

当前 `extractTextFromParts`（`src/response.ts:63-67`）实现正确。

**动作**：确认无误，无需修改。

### T2-4. 重写 formatJsonOutput（核心任务）

**替换** `src/response.ts:116-128` 的 `formatJsonOutput` 函数。

新实现：

```typescript
export function formatJsonOutput(normalized: NormalizedResponse): string {
  // 确定模式：error > structured > text
  let mode: "structured" | "text" | "error";
  if (normalized.error) {
    mode = "error";
  } else if (normalized.structuredOutput !== null) {
    mode = "structured";
  } else {
    mode = "text";
  }

  const output = {
    mode,
    sessionId: normalized.info?.sessionID ?? null,
    result: mode === "structured" ? normalized.structuredOutput : null,
    text: mode === "text" ? (normalized.text ?? null) : null,
    error: normalized.error
      ? { name: normalized.error.name, message: normalized.error.message, retries: normalized.error.retries }
      : null,
  };

  return JSON.stringify(output, null, 2);
}
```

**要求**：
- 函数签名和导出名不变：`formatJsonOutput(normalized: NormalizedResponse): string`
- `mode` 优先级：error > structured > text
- `sessionId` 必须透出
- 不引入新依赖

### T2-5. 检查业务层不越界

检查 `src/main.ts`，确认没有直接猜测 response 原始结构的代码。

当前 `main.ts:186-214` 通过 `normalizeSdkResponse` + `formatJsonOutput`/`formatTextOutput` 消费，符合要求。如有越界需修复。

---

## T3：落地统一 JSON 输出契约

T3 的核心就是 T2-4，已在上面完整定义。

额外确认：`main.ts:206` 调用 `formatJsonOutput(normalized)` 不需要改调用方式。

---

## 风险提示

1. **不要加 `structured_output` 兼容** — 已明确冻结
2. **不要把解析和格式化混在一起** — `normalizeSdkResponse` 解析，`formatJsonOutput` 格式化
3. **不要修改 `NormalizedResponse` 类型签名**

---

## 完成标准

- [ ] `extractErrorFromInfo` 兼容 `info.error.message` 直接字段（fallback）
- [ ] `AssistantInfo` 类型已更新支持直接 `message`
- [ ] `formatJsonOutput` 输出 `{ mode, sessionId, result, text, error }`
- [ ] error 优先级高于 structured
- [ ] sessionId 从 `info.sessionID` 提取
- [ ] `main.ts` 不直接猜测 response 原始结构
- [ ] 缺字段时不崩溃
- [ ] `npm run typecheck && npm test` 全部通过

## 交付物

完成后向主 agent 提交：

1. 变更说明：改了哪些函数、为什么改
2. 受影响函数列表
3. 新旧 `formatJsonOutput` 输出示例对比
4. 建议新增的测试用例列表（交给 subagent-C）
