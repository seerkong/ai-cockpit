<script setup lang="ts">
import AppToolbar from './AppToolbar.vue';
import AppActivityBar from './AppActivityBar.vue';
import AppStatusBar from './AppStatusBar.vue';

/**
 * AppLayout - 全局布局容器
 * 实现 VSCode 风格的布局结构：
 * - 顶部：工具栏 (AppToolbar)
 * - 左侧：活动栏 (AppActivityBar)
 * - 中间：主内容区 (slot)
 * - 底部：状态栏 (AppStatusBar)
 */
</script>

<template>
  <div class="app-layout">
    <AppToolbar class="layout-toolbar" />
    <AppActivityBar class="layout-activity-bar" />
    <main class="layout-main">
      <slot />
    </main>
    <AppStatusBar class="layout-status-bar" />
  </div>
</template>

<style scoped>
.app-layout {
  display: grid;
  grid-template-areas:
    "toolbar toolbar"
    "activity main"
    "status status";
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
}

.layout-toolbar {
  grid-area: toolbar;
}

.layout-activity-bar {
  grid-area: activity;
}

.layout-main {
  grid-area: main;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.layout-status-bar {
  grid-area: status;
}
</style>
