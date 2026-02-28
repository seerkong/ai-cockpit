// @frontend/composer — UI components and UI-support libs
export * from '@frontend/organ';

// Libs
export { highlightCode, markdownToHtml, markdownToHtmlAsync, highlightCodeAsync, preloadMarkdownLibs } from './lib/markdown';
export { filterModelOptions, groupModelOptions, type ModelOption, type ModelGroup } from './lib/model-picker';
export { modelKey, flattenModelGroups, type ModelKeyItem, type ModelGroupLike } from './lib/model-selector-popover';
export { parseSlashQuery, filterSlashCommands, slashCommandReplacement, type SlashCommandOption } from './lib/slash-command-popover';
export { questionHeader, questionPrompt, questionOptions, questionMultiple, type QuestionOption } from './lib/question-dock';
export {
  extractMessageTokens,
  resolveModelLabel,
  resolveModelContextLimit,
  extractLatestAssistantInfo,
  computeContextUsage,
  computeSessionSummary,
  type ModelOptionLike,
  type ExtractedTokens,
  type ContextUsage,
} from './lib/session-metrics';

// Components
export { default as DockviewTest } from './components/DockviewTest.vue';
export { default as FileAttachPopover } from './components/FileAttachPopover.vue';
export { default as ModelSelectorPopover } from './components/ModelSelectorPopover.vue';
export { default as PermissionDock } from './components/PermissionDock.vue';
export { default as QuestionDock } from './components/QuestionDock.vue';
export { default as SessionStatusBar } from './components/SessionStatusBar.vue';
export { default as SlashCommandPopover } from './components/SlashCommandPopover.vue';
export { default as BottomPanel } from './components/panels/BottomPanel.vue';
export { default as ChatPanel } from './components/panels/ChatPanel.vue';
export { default as ConnectionsPanel } from './components/panels/ConnectionsPanel.vue';
export { default as ConnectionsBucketPane } from './components/panels/ConnectionsBucketPane.vue';
export { default as RightPanel } from './components/panels/RightPanel.vue';
