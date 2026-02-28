import { ref } from 'vue';

export type NotificationKind = 'info' | 'error' | 'success';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  message: string;
}

export function useNotifications() {
  const notifications = ref<NotificationItem[]>([]);

  function pushNotification(kind: NotificationKind, message: string, ttlMs = 5000) {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    notifications.value = [...notifications.value, { id, kind, message }];
    if (ttlMs > 0) {
      setTimeout(() => {
        notifications.value = notifications.value.filter((item) => item.id !== id);
      }, ttlMs);
    }
  }

  return {
    notifications,
    pushNotification,
  };
}
