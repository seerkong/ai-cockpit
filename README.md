# ai-cockpit

A web-based cockpit for managing and interacting with AI coding assistants. Connect to local [opencode](https://opencode.ai) server instances, manage multiple workspaces and connections simultaneously, and chat with AI agents through a VSCode-inspired dockview layout.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: Elysia + Bun, WebSocket + JSON Patch realtime channel, SQLite persistence
- **Frontend**: Vue 3 + Vite + TypeScript, Pinia, Dockview, Vue Router
- **Monorepo**: Bun workspaces (`backend/`, `frontend/`, `shared/`)

## Prerequisites

Install the Bun runtime: https://bun.sh

```bash
curl -fsSL https://bun.sh/install | bash
```

Or on macOS via Homebrew:

```bash
brew install oven-sh/bun/bun
```

## Getting Started

### Install dependencies

```bash
bun install
```

### Start development servers

Backend (with hot reload):

```bash
bun run dev:backend
```

Frontend (Vite dev server):

```bash
bun run dev:frontend
```

Or run both in separate terminals.

### Run tests

```bash
bun run test
```

## Project Structure

```
ai-cockpit/
├── backend/          # Elysia API server, OpenCode provider, WebSocket realtime
├── frontend/         # Vue 3 SPA, dockview layout, chat UI
├── shared/           # Shared types and utilities
├── codument/         # Spec-driven development framework
├── docs/             # Internal documentation
└── package.json      # Monorepo root
```
