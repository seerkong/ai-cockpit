<template>
  <div class="app">
    <header class="header">
      <div>
        <h1>Workspace</h1>
        <div class="muted">{{ workspaceId }}</div>
      </div>
      <div class="workspace">
        <button class="secondary" @click="goHome">Back</button>
      </div>
    </header>

    <section class="panel" style="grid-column: 1 / -1">
      <h2>Loading…</h2>
      <div class="muted">
        {{ statusText }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWorkspacesStore } from '@frontend/organ';
import { useWorkspaceSelectionStore } from '@frontend/organ';

type SessionInfo = {
  id: string;
  title?: string;
};

const route = useRoute();
const router = useRouter();
const workspaces = useWorkspacesStore();
const selectionStore = useWorkspaceSelectionStore();
workspaces.hydrate();

const workspaceId = computed(() => String(route.params.workspaceId || ''));
const token = computed(() => workspaces.tokenFor(workspaceId.value));

const statusText = ref('Fetching sessions…');

function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (token.value) headers.set('Authorization', `Bearer ${token.value}`);
  return fetch(path, { ...init, headers });
}

function goHome() {
  router.push({ name: 'workspace' });
}

async function ensureSessionAndRedirect() {
  if (!workspaceId.value || !token.value) {
    await router.replace({ name: 'workspace' });
    return;
  }

  workspaces.setActive(workspaceId.value);
  selectionStore.setWorkspaceId(workspaceId.value);

  const listRes = await apiFetch(`/api/v1/workspaces/${workspaceId.value}/sessions`);
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => '');
    throw new Error(text || `Failed to list sessions (${listRes.status})`);
  }
  const sessions = (await listRes.json()) as SessionInfo[];
  const preferred = workspaces.lastSessionFor(workspaceId.value);
  const pick =
    (preferred && sessions.find((s) => s.id === preferred)?.id) ||
    sessions?.[0]?.id;
  if (pick) {
    workspaces.setLastSession(workspaceId.value, pick);
    await router.replace({
      name: 'work',
    });
    return;
  }

  statusText.value = 'No sessions found; creating one…';
  const createRes = await apiFetch(`/api/v1/workspaces/${workspaceId.value}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(text || `Failed to create session (${createRes.status})`);
  }
  const created = (await createRes.json()) as { id?: string };
  const sessionId = created?.id;
  if (!sessionId) {
    throw new Error('Invalid session create response');
  }

  workspaces.setLastSession(workspaceId.value, sessionId);
  await router.replace({
    name: 'work',
  });
}

onMounted(async () => {
  try {
    await ensureSessionAndRedirect();
  } catch (e) {
    statusText.value = e instanceof Error ? e.message : String(e);
  }
});
</script>
