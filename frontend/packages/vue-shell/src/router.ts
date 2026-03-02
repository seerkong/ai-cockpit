import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: 'workspace' },
  },
  // Legacy URLs (pre-dockview) -> canonical /work route.
  {
    path: '/workspaces/:workspaceId/sessions',
    redirect: (to) => ({
      name: 'work',
      query: {
        connId: String(to.params.workspaceId || ''),
      },
    }),
  },
  {
    path: '/workspaces/:workspaceId/sessions/:sessionId',
    redirect: (to) => ({
      name: 'work',
      query: {
        connId: String(to.params.workspaceId || ''),
        sessionId: String(to.params.sessionId || ''),
      },
    }),
  },
  {
    name: 'workspace',
    path: '/workspace',
    component: () => import('./pages/HomePage.vue'),
  },
  {
    name: 'work',
    path: '/work',
    component: () => import('./pages/SessionDockview.vue'),
  },
];

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(),
    routes,
  });
}
