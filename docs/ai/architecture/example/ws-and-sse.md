# WebSocket 消息与 SSE 转发示例

本文件摘取当前实现中的关键片段（非伪代码），用于理解端到端转发。

## 前端：发送 config/prompt

来源：`frontend/src/App.tsx`

```tsx
send({
  type: 'config',
  payload: { workspace: workspace.trim() },
});

send({
  type: 'prompt',
  payload: {
    prompt: content,
    sessionId: currentSessionId || undefined,
  },
});
```

## 后端：WebSocket 消息路由

来源：`backend/src/index.ts`

```ts
const data = JSON.parse(msgStr) as ClientMessage;

switch (data.type) {
  case 'config':
    await handleConfig(ws, data.payload as ConfigPayload);
    break;
  case 'prompt':
    handlePrompt(ws, data.payload as PromptPayload).catch(err => {
      sendMessage(ws, {
        type: 'error',
        payload: { message: err instanceof Error ? err.message : 'Unknown error' },
      });
    });
    break;
  case 'abort':
    await handleAbort(ws);
    break;
}
```

## 后端：先订阅事件流再发送 prompt

来源：`backend/src/index.ts`

```ts
// Start event stream FIRST (don't await - it runs in background)
const eventPromise = processEventStream(ws, client, sessionId);

// Give the event stream a moment to connect
await new Promise(resolve => setTimeout(resolve, 100));

// Send the prompt
await client.sendPrompt(sessionId, payload.prompt);

// Wait for event stream to complete
await eventPromise;
```

## OpenCodeClient：SSE 事件解析（简化片段）

来源：`backend/src/opencode-client.ts`

```ts
const resp = await fetch(
  `${this.config.baseUrl}/event?directory=${encodeURIComponent(this.config.directory)}`,
  {
    headers,
    signal: this.abortController.signal,
  }
);

const reader = resp.body?.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  let eventData = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      eventData += line.slice(6);
    } else if (line === '' && eventData) {
      const event = JSON.parse(eventData) as OpencodeEvent;
      if (this.eventMatchesSession(event, sessionId)) {
        yield event;
        if (event.type === 'session.idle') return;
      }
      eventData = '';
    }
  }
}
```
