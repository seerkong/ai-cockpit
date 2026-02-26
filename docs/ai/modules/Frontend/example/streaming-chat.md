# useChat streaming 处理示例

来源：`frontend/src/hooks/useChat.ts`

## assistant_message：更新而非追加

```ts
case 'assistant_message': {
  const content = payload.content as string;
  const currentId = currentAssistantIdRef.current;

  if (currentId) {
    setMessages(prev => prev.map(msg =>
      msg.id === currentId
        ? { ...msg, content }
        : msg
    ));
  } else {
    const newId = generateId();
    currentAssistantIdRef.current = newId;
    setMessages(prev => [...prev, {
      id: newId,
      type: 'assistant',
      content,
      timestamp: new Date(),
    }]);
  }
  break;
}
```

## tool_use：用 key 去重更新状态

```ts
const toolKey = `${toolName}-${content}`;
const existingId = toolMessageIdsRef.current.get(toolKey);

if (existingId) {
  setMessages(prev => prev.map(msg =>
    msg.id === existingId
      ? { ...msg, toolStatus: status }
      : msg
  ));
} else {
  const newId = generateId();
  toolMessageIdsRef.current.set(toolKey, newId);
  setMessages(prev => [...prev, {
    id: newId,
    type: 'tool',
    content,
    toolName,
    toolStatus: status,
    timestamp: new Date(),
  }]);
}
```

要点：该策略简单但不完美（不同 call 可能 content 相同）。如果未来要更严谨，可以把后端的 `callID` 也传到前端。
