# OpenCode Server API 参考

来源：https://open-code.ai/zh/docs/server + SDK types.gen.ts

## 核心端点

### 会话
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /session | 列出会话 |
| POST | /session | 创建会话 |
| GET | /session/:id | 获取会话详情 |
| GET | /session/:id/message | 获取消息列表 |
| POST | /session/:id/message | 发送消息 |
| POST | /session/:id/command | 执行斜杠命令 |
| POST | /session/:id/abort | 中止会话 |
| POST | /session/:id/fork | Fork 会话 |
| POST | /session/:id/share | 分享会话 |
| POST | /session/:id/summarize | 总结会话 |
| POST | /session/:id/revert | 回退会话 |
| GET | /session/:id/diff | 获取文件差异 |
| GET | /session/:id/todo | 获取待办 |

### 权限与问题
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /session/:id/permissions/:permissionID | 响应权限请求（body: { response, remember? }） |

### 命令/代理/模型
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /command | 命令列表 |
| GET | /agent | 代理列表 |
| GET | /provider | 提供商和模型（含 limit.context） |

### 文件搜索
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /find/file?query=q | 文件名搜索 |
| GET | /file/content?path=p | 读取文件内容 |

## SSE 事件类型（关键）

```
session.status    → { sessionID, status: { type: "idle"|"busy"|"retry" } }
session.idle      → { sessionID }
permission.updated → Permission { id, type, pattern?, sessionID, title, metadata, time }
permission.replied → { sessionID, permissionID, response }
message.updated   → { info: Message }
message.part.updated → { part: Part, delta?: string }
todo.updated      → { sessionID, todos }
session.diff      → { sessionID, diff }
```

## 核心数据结构

### Message.time
```typescript
// UserMessage
time: { created: number }  // Unix timestamp ms

// AssistantMessage
time: { created: number, completed?: number }  // completed 存在表示已完成
tokens: { input, output, reasoning, cache: { read, write } }
cost: number
```

### Model.limit
```typescript
type Model = {
  id: string
  name: string
  limit: { context: number, output: number }  // token 上限
  cost: { input, output, cache: { read, write } }
}
```

### Permission
```typescript
type Permission = {
  id: string, type: string, pattern?: string | string[],
  sessionID: string, messageID: string, title: string,
  metadata: Record<string, unknown>, time: { created: number }
}
// 响应: POST body { response: "once"|"always"|"reject", remember?: boolean }
```

### Command
```typescript
type Command = { name: string, description?: string, agent?: string, template: string }
```

### 发送消息 body
```typescript
{
  model?: { providerID, modelID },
  agent?: string,
  parts: [
    { type: "text", text: string } |
    { type: "file", mime: string, url: string, filename?: string }
  ]
}
```
