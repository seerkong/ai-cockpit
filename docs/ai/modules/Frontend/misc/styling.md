# 样式与布局

样式集中在 `frontend/src/index.css`，采用 CSS 变量 + className 的方式（无 Tailwind/组件库）。

## CSS 变量

`index.css` 的 `:root` 定义了主题变量，例如：

- `--bg-primary/secondary/tertiary`
- `--text-primary/secondary`
- `--accent` / `--accent-hover`
- `--success` / `--warning` / `--error`

## 组件样式

- `MessageList`：不同 message type 通过 `.message.<type>` 控制背景与对齐。
- `tool` 消息有专门 UI（tool header + status badge）。

如果要引入 Markdown 渲染/代码高亮，建议在 MessageList 的渲染层做增强，并保持 `useChat` 仍然输出纯文本内容。
