import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { ref } from 'vue';
import { useChat, type UseChatDeps } from './useChat';

function makeChatDeps(overrides: Partial<UseChatDeps> = {}): UseChatDeps {
  return {
    activeConnectionId: ref('c1'),
    sessionId: ref('s1'),
    apiFetchForConnection: mock(() => Promise.reject(new Error('not mocked'))),
    resolveExecutionConnectionId: () => 'c1',
    pushNotification: mock(() => {}),
    sessionError: ref<string | null>(null),
    sessionWorking: ref(false),
    messagePageLimit: 3,
    messagePollIntervalMs: 50,
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: () => mockFetchResponse(body, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

function makeMessages(ids: string[]) {
  return ids.map((id) => ({
    info: { id, role: 'user' },
    parts: [{ type: 'text', text: `msg-${id}` }],
  }));
}

describe('useChat', () => {
  describe('refreshMessages', () => {
    test('updates messages and sets hasOlder when page full', async () => {
      const msgs = makeMessages(['m1', 'm2', 'm3']); // length === pageLimit (3)
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse(msgs))),
      });
      const chat = useChat(deps);

      await chat.refreshMessages('c1', 's1');

      expect(chat.messages.value).toHaveLength(3);
      expect(chat.messages.value[0]?.info.id).toBe('m1');
      expect(chat.messagesHasOlder.value).toBe(true);
    });

    test('sets hasOlder false when page not full', async () => {
      const msgs = makeMessages(['m1', 'm2']); // length < pageLimit (3)
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse(msgs))),
      });
      const chat = useChat(deps);

      await chat.refreshMessages('c1', 's1');

      expect(chat.messages.value).toHaveLength(2);
      expect(chat.messagesHasOlder.value).toBe(false);
    });

    test('clears sessionError when not silent', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse([]))),
      });
      deps.sessionError.value = 'old error';
      const chat = useChat(deps);

      await chat.refreshMessages('c1', 's1', false);

      expect(deps.sessionError.value).toBeNull();
    });

    test('does not clear sessionError when silent', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse([]))),
      });
      deps.sessionError.value = 'old error';
      const chat = useChat(deps);

      await chat.refreshMessages('c1', 's1', true);

      expect(deps.sessionError.value).toBe('old error');
    });

    test('throws on non-ok response', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse('Server error', false, 500))),
      });
      const chat = useChat(deps);

      expect(chat.refreshMessages('c1', 's1')).rejects.toThrow('Server error');
    });

    test('no-ops when connectionId is empty', async () => {
      const fetchMock = mock(() => Promise.resolve(mockFetchResponse([])));
      const deps = makeChatDeps({ apiFetchForConnection: fetchMock });
      const chat = useChat(deps);

      await chat.refreshMessages('', 's1');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('loadOlderMessages', () => {
    test('prepends older messages and deduplicates', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() =>
          Promise.resolve(mockFetchResponse(makeMessages(['m0', 'm1']))),
        ),
      });
      const chat = useChat(deps);
      // Seed existing messages
      chat.messages.value = makeMessages(['m1', 'm2']) as any;

      await chat.loadOlderMessages();

      expect(chat.messages.value).toHaveLength(3);
      expect(chat.messages.value[0]?.info.id).toBe('m0');
      expect(chat.messages.value[1]?.info.id).toBe('m1');
      expect(chat.messages.value[2]?.info.id).toBe('m2');
      expect(chat.messagesLoadingOlder.value).toBe(false);
    });

    test('sets hasOlder false when no older messages returned', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse([]))),
      });
      const chat = useChat(deps);
      chat.messages.value = makeMessages(['m1']) as any;

      await chat.loadOlderMessages();

      expect(chat.messagesHasOlder.value).toBe(false);
      expect(chat.messagesLoadingOlder.value).toBe(false);
    });

    test('sets hasOlder based on page limit', async () => {
      // Return exactly pageLimit (3) older messages → hasOlder stays true
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() =>
          Promise.resolve(mockFetchResponse(makeMessages(['a', 'b', 'c']))),
        ),
      });
      const chat = useChat(deps);
      chat.messages.value = makeMessages(['m1']) as any;

      await chat.loadOlderMessages();

      expect(chat.messagesHasOlder.value).toBe(true);
    });

    test('sets loadingOlder flag during fetch', async () => {
      let resolvePromise: (v: Response) => void;
      const pending = new Promise<Response>((r) => { resolvePromise = r; });
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => pending),
      });
      const chat = useChat(deps);
      chat.messages.value = makeMessages(['m1']) as any;

      const promise = chat.loadOlderMessages();
      expect(chat.messagesLoadingOlder.value).toBe(true);

      resolvePromise!(mockFetchResponse(makeMessages(['m0'])));
      await promise;
      expect(chat.messagesLoadingOlder.value).toBe(false);
    });

    test('no-ops when no existing messages', async () => {
      const fetchMock = mock(() => Promise.resolve(mockFetchResponse([])));
      const deps = makeChatDeps({ apiFetchForConnection: fetchMock });
      const chat = useChat(deps);

      await chat.loadOlderMessages();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    test('no-ops when already loading', async () => {
      const fetchMock = mock(() => Promise.resolve(mockFetchResponse([])));
      const deps = makeChatDeps({ apiFetchForConnection: fetchMock });
      const chat = useChat(deps);
      chat.messages.value = makeMessages(['m1']) as any;
      chat.messagesLoadingOlder.value = true;

      await chat.loadOlderMessages();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('startMessagePolling / stopMessagePolling', () => {
    let timers: ReturnType<typeof setInterval>[] = [];
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;

    beforeEach(() => {
      timers = [];
      globalThis.setInterval = mock((...args: Parameters<typeof setInterval>) => {
        const id = origSetInterval(...args);
        timers.push(id);
        return id;
      }) as any;
      globalThis.clearInterval = mock(origClearInterval) as any;
    });

    afterEach(() => {
      for (const t of timers) origClearInterval(t);
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    });

    test('startMessagePolling creates interval', () => {
      const deps = makeChatDeps();
      const chat = useChat(deps);

      chat.startMessagePolling();

      expect(globalThis.setInterval).toHaveBeenCalled();
    });

    test('stopMessagePolling clears interval', () => {
      const deps = makeChatDeps();
      const chat = useChat(deps);

      chat.startMessagePolling();
      chat.stopMessagePolling();

      expect(globalThis.clearInterval).toHaveBeenCalled();
    });

    test('startMessagePolling no-ops without connectionId', () => {
      const deps = makeChatDeps({ activeConnectionId: ref('') });
      const chat = useChat(deps);

      chat.startMessagePolling();

      expect(globalThis.setInterval).not.toHaveBeenCalled();
    });

    test('startMessagePolling no-ops without sessionId', () => {
      const deps = makeChatDeps({ sessionId: ref('') });
      const chat = useChat(deps);

      chat.startMessagePolling();

      expect(globalThis.setInterval).not.toHaveBeenCalled();
    });

    test('startMessagePolling stops previous timer before starting new one', () => {
      const deps = makeChatDeps();
      const chat = useChat(deps);

      chat.startMessagePolling();
      chat.startMessagePolling();

      expect(globalThis.clearInterval).toHaveBeenCalled();
      // Two setInterval calls (one per start)
      expect((globalThis.setInterval as any).mock.calls.length).toBe(2);
    });

    test('stopMessagePolling is idempotent', () => {
      const deps = makeChatDeps();
      const chat = useChat(deps);

      chat.stopMessagePolling();
      chat.stopMessagePolling();

      // clearInterval should not be called when there's no timer
      expect(globalThis.clearInterval).not.toHaveBeenCalled();
    });
  });

  describe('handleSendPrompt', () => {
    test('sends prompt and refreshes messages', async () => {
      const fetchMock = mock(() => Promise.resolve(mockFetchResponse({ ok: true })));
      const deps = makeChatDeps({ apiFetchForConnection: fetchMock });
      const chat = useChat(deps);

      await chat.handleSendPrompt({ prompt: 'hello' });

      expect(deps.sessionWorking.value).toBe(false);
      // At least 2 calls: prompt + refreshMessages
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('sets error when no connection', async () => {
      const deps = makeChatDeps({ resolveExecutionConnectionId: () => '' });
      const chat = useChat(deps);

      await chat.handleSendPrompt({ prompt: 'hello' });

      expect(deps.sessionError.value).toContain('No active connection');
      expect(deps.pushNotification).toHaveBeenCalled();
    });

    test('sets error when no session', async () => {
      const deps = makeChatDeps({ sessionId: ref('') });
      const chat = useChat(deps);

      await chat.handleSendPrompt({ prompt: 'hello' });

      expect(deps.sessionError.value).toContain('No active session');
    });
  });

  describe('handleAbort', () => {
    test('aborts and clears working flag', async () => {
      const deps = makeChatDeps({
        apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse({ ok: true }))),
      });
      deps.sessionWorking.value = true;
      const chat = useChat(deps);

      await chat.handleAbort();

      expect(deps.sessionWorking.value).toBe(false);
    });

    test('no-ops when not working', async () => {
      const fetchMock = mock(() => Promise.resolve(mockFetchResponse({ ok: true })));
      const deps = makeChatDeps({ apiFetchForConnection: fetchMock });
      deps.sessionWorking.value = false;
      const chat = useChat(deps);

      await chat.handleAbort();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
