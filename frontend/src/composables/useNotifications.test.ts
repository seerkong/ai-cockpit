import { describe, expect, test } from 'bun:test';
import { useNotifications } from './useNotifications';

describe('useNotifications', () => {
  test('adds notification with pushNotification', () => {
    const { notifications, pushNotification } = useNotifications();

    pushNotification('info', 'hello', 0);

    expect(notifications.value).toHaveLength(1);
    expect(notifications.value[0]?.kind).toBe('info');
    expect(notifications.value[0]?.message).toBe('hello');
  });

  test('expires notification after ttl', async () => {
    const { notifications, pushNotification } = useNotifications();

    pushNotification('success', 'done', 10);
    expect(notifications.value).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(notifications.value).toHaveLength(0);
  });
});
