# 事件映射示例：tool_use

来源：`backend/src/index.ts`（`processEvent` 的 `message.part.updated` 分支）

该分支把 OpenCode 的 tool part 变成前端可渲染的 `tool_use`。

```ts
if (partType === 'tool') {
  const callId = part.callID as string;
  const toolName = part.tool as string;
  const state = part.state as Record<string, unknown>;

  const status = state.status as string || 'pending';
  const input = state.input;
  const output = state.output as string | undefined;
  const title = state.title as string | undefined;

  // Build content string
  let content = title || toolName;
  if (input && typeof input === 'object') {
    const inputObj = input as Record<string, unknown>;
    if (inputObj.command) content = inputObj.command as string;
    else if (inputObj.filePath) content = inputObj.filePath as string;
    else if (inputObj.url) content = inputObj.url as string;
    else if (inputObj.query) content = inputObj.query as string;
  }

  return {
    type: 'tool_use',
    payload: { toolName, status, content, input, output },
  };
}
```

要点：

- `content` 会尽量提取“对用户有意义的摘要”（command/filePath/url/query）。
- 前端当前用 `toolName + content` 作为去重 key（见 `frontend/src/hooks/useChat.ts`）。
