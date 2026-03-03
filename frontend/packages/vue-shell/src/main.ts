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

// Prevent a known Dockview teardown edge-case from blanking the SPA.
// This is a narrow filter: only suppresses dispose-time DOM NotFoundError.
window.addEventListener('unhandledrejection', (event) => {
  const reason: any = (event as any).reason;
  const message = typeof reason?.message === 'string' ? reason.message : String(reason ?? '');
  if (!message.includes('removeChild') || !message.includes('The node to be removed is not a child')) return;
  const stack = typeof reason?.stack === 'string' ? reason.stack : '';
  if (!stack.includes('dockview')) return;
  event.preventDefault();
});

createApp(App).use(router).use(pinia).mount('#app');
