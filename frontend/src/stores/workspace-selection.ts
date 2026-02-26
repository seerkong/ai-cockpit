import { defineStore } from 'pinia';

export const useWorkspaceSelectionStore = defineStore('workspaceSelection', {
  state: () => ({
    selectedWorkspaceId: '',
    selectedSessionId: '',
  }),
  actions: {
    setWorkspaceId(id: string) {
      this.selectedWorkspaceId = id || '';
    },
    clearWorkspace() {
      this.selectedWorkspaceId = '';
    },
    setSessionId(id: string) {
      this.selectedSessionId = id || '';
    },
    clearSession() {
      this.selectedSessionId = '';
    },
    clearAll() {
      this.selectedWorkspaceId = '';
      this.selectedSessionId = '';
    },
  },
});
