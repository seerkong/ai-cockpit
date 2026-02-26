# Upstream Reference (OpenCode)

This track ports OpenCode official web "workspace opened" page behaviors.

## Upstream Location

- Upstream repo (local): `E:/ai-dev/src/opencode`
- Web workspace app (SolidJS + Vite): `E:/ai-dev/src/opencode/packages/app`
- Shared UI components (review/turn rendering): `E:/ai-dev/src/opencode/packages/ui`

## Key Upstream Files (starting points)

- Route + providers: `E:/ai-dev/src/opencode/packages/app/src/app.tsx`
- Workspace shell layout (sidebar/workspaces/sessions + palette commands): `E:/ai-dev/src/opencode/packages/app/src/pages/layout.tsx`
- Workspace page (session view): `E:/ai-dev/src/opencode/packages/app/src/pages/session.tsx`
- Chat turn rendering: `E:/ai-dev/src/opencode/packages/ui/src/components/session-turn.tsx`
- Prompt input UX: `E:/ai-dev/src/opencode/packages/app/src/components/prompt-input.tsx`
- Review panel (diff list + inline comments): `E:/ai-dev/src/opencode/packages/ui/src/components/session-review.tsx`
- Command palette: `E:/ai-dev/src/opencode/packages/app/src/components/dialog-select-file.tsx`
- Session header: `E:/ai-dev/src/opencode/packages/app/src/components/session/session-header.tsx`
- Context tab: `E:/ai-dev/src/opencode/packages/app/src/components/session/session-context-tab.tsx`
