# 子 PRD-C：`--json` 真实结构化输出重构

## 1. 背景

当前 CLI 已有 `--json` 选项，但其行为更接近"将结果以 JSON 形式输出"，而不是真正请求模型返回受 JSON Schema 约束的 structured output。这会导致功能语义与文档、用户预期不一致。

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

```text
schemas/basic.json
```

内容如下：

```json
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
* 旧测试可能基于"JSON 打印"思路，需要改

---

## 14. 回滚方案

如果 structured output 路径接入失败：

1. 暂时保留 `--json` 但在 help/README 中降级描述为"JSON 输出格式"
2. 新增 `--structured-json` 作为实验参数
   不过这不是首选，首选仍是直接修正 `--json` 的真实语义。

---

## 15. Definition of Done

* `--json` 真正等于 structured output
* `--schema-file` 可用
* 示例 schema 存在
* 测试通过
* README 与实际行为一致
