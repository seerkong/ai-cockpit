import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';
import { createPinia } from 'pinia';
import { useWorkspacesStore } from './stores/workspaces';
import './styles.css';

const pinia = createPinia();
const router = createAppRouter();

// Hydrate persisted workspace tokens before any route tries to use them.
const workspaces = useWorkspacesStore(pinia);
workspaces.hydrate();

createApp(App).use(router).use(pinia).mount('#app');
