import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { createPinia } from 'pinia';
import { useWorkspacesStore, useWorkSettingsStore } from '@frontend/organ';
import './styles.css';

const pinia = createPinia();
const router = createAppRouter();

// Hydrate persisted workspace tokens before any route tries to use them.
const workspaces = useWorkspacesStore(pinia);
workspaces.hydrate();

// Hydrate persisted /work user settings early.
const workSettings = useWorkSettingsStore(pinia);
workSettings.hydrate();

createApp(App).use(router).use(pinia).mount('#app');
