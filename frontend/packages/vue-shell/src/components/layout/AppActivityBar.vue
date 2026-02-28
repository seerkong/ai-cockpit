<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';


/**
 * AppActivityBar - 左侧活动栏组件
 * 类似 VSCode 最左侧的图标栏，用于切换主要视图
 */

const route = useRoute();
const router = useRouter();

// 活动栏项目
const items = [
  { 
    id: 'workspaces', 
    icon: 'workspaces',
    title: 'Workspaces',
    route: { name: 'workspace' }
  },
  { 
    id: 'session', 
    icon: 'session',
    title: 'Session Details',
    route: { name: 'work' }
  },
];

const activeItem = computed(() => {
  if (route.name === 'workspace') return 'workspaces';
  if (route.name === 'work') return 'session';
  return '';
});

const navigateTo = (item: typeof items[0]) => {
  router.push(item.route);
};
</script>

<template>
  <aside class="app-activity-bar">
    <div class="activity-items">
      <button
        v-for="item in items"
        :key="item.id"
        :class="['activity-item', { active: activeItem === item.id }]"
        :title="item.title"
        @click="navigateTo(item)"
      >
        <!-- Workspaces Icon (folder-like) -->
        <svg v-if="item.icon === 'workspaces'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <!-- Session Icon (chat-like) -->
        <svg v-else-if="item.icon === 'session'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-activity-bar {
  display: flex;
  flex-direction: column;
  width: 48px;
  background: var(--bg);
  border-right: 1px solid var(--border);
}

.activity-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.activity-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: 8px;
  position: relative;
}

.activity-item:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
}

.activity-item.active {
  color: var(--text);
}

.activity-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 24px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}
</style>
