<script setup lang="ts">
import { ref, markRaw, onBeforeUnmount } from 'vue';
import 'dockview-vue/dist/styles/dockview.css';
import { DockviewVue, type DockviewReadyEvent } from 'dockview-vue';
import type { DockviewApi } from 'dockview-core';

const dockApi = ref<DockviewApi | null>(null);

const onReady = (event: DockviewReadyEvent) => {
  // CRITICAL: Use markRaw to prevent Vue reactivity issues
  dockApi.value = markRaw(event.api);
  
  // Add test panels
  event.api.addPanel({
    id: 'panel_1',
    component: 'testPanel',
    title: 'Test Panel 1',
  });
  
  event.api.addPanel({
    id: 'panel_2',
    component: 'testPanel',
    title: 'Test Panel 2',
    position: { referencePanel: 'panel_1', direction: 'right' },
  });
};

onBeforeUnmount(() => {
  dockApi.value?.dispose();
});
</script>

<script lang="ts">
import { defineComponent, h } from 'vue';

const TestPanel = defineComponent({
  name: 'TestPanel',
  props: ['params'],
  setup(props) {
    return () => h('div', { 
      style: { 
        padding: '16px', 
        color: '#e5e7eb',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      } 
    }, `Panel: ${props.params?.api?.title || 'Unknown'}`);
  }
});

export default {
  components: {
    testPanel: TestPanel,
  }
};
</script>

<template>
  <div style="width: 100%; height: 400px; border: 1px solid #374151; border-radius: 8px; overflow: hidden;">
    <DockviewVue
      class="dockview-theme-abyss"
      style="width: 100%; height: 100%"
      @ready="onReady"
    />
  </div>
</template>
