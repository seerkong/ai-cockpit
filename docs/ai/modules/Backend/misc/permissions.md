# OpenCode 权限与自动批准

后端启动 OpenCode server 时会通过环境变量 `OPENCODE_PERMISSION` 配置权限策略（见 `backend/src/opencode-server.ts`）。

## 当前行为（原型默认）

`handlePrompt` 调用：

```ts
state.server = await spawnOpenCodeServer(state.workspace, { autoApprove: true });
```

在 `autoApprove` 路径下，后端设置：

```ts
env.OPENCODE_PERMISSION = JSON.stringify({ question: 'deny' });
```

这意味着：

- OpenCode 的“提问/交互式确认”会被拒绝
- 其余工具权限如何解释取决于 OpenCode server 对该配置的语义（原型目标是减少审批摩擦）

## 如果要实现“工具审批流”

可以把 `autoApprove` 设为 false，让后端使用更细粒度的权限策略：

```ts
env.OPENCODE_PERMISSION = JSON.stringify({
  edit: 'ask',
  bash: 'ask',
  webfetch: 'ask',
  doom_loop: 'ask',
  external_directory: 'ask',
  question: 'deny',
});
```

下一步通常是：

- 从 OpenCode event 中提取“待审批”的信号
- 通过 WS 把审批请求推送给前端，让用户确认后再继续
