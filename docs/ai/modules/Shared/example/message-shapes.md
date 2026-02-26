# 协议类型片段

来源：`shared/index.ts`

## ClientMessage

```ts
export interface ClientMessage {
  type: 'config' | 'prompt' | 'abort';
  payload: ConfigPayload | PromptPayload | AbortPayload;
}
```

## ServerMessage

```ts
export interface ServerMessage {
  type:
    | 'connected'
    | 'session_start'
    | 'assistant_message'
    | 'tool_use'
    | 'thinking'
    | 'error'
    | 'done'
    | 'system';
  payload: unknown;
}
```

说明：当前 payload 是 `unknown`，前后端会在运行时按 `type` 转成具体结构（例如 `payload.message`、`payload.content`）。
