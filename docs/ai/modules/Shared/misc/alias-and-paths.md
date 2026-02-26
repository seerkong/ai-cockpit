# shared alias 与路径配置

本项目通过两层机制让前后端都能 `import type { ... } from 'shared'`：

## 1) TypeScript paths

- `frontend/tsconfig.json`：
  - `paths: { "shared": ["../shared"] }`
- `backend/tsconfig.json`：
  - `paths: { "shared": ["../shared"] }`
  - `include` 包含 `../shared/**/*`

## 2) Vite resolve.alias

`frontend/vite.config.ts`：

```ts
resolve: {
  alias: {
    shared: path.resolve(__dirname, '../shared'),
  },
},
```

如果你只改了 TS paths 而没改 Vite alias，可能会出现“类型能过但运行时报模块找不到”的情况。
