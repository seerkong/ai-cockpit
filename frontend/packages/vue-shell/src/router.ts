import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: { name: 'workspace' },
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
