import { describe, expect, test, mock } from 'bun:test';
import { ref } from 'vue';
import {
  normalizeSessionsPayload,
  normalizeMessagesPayload,
  extractSessionId,
  asObject,
  asString,
  useSessions,
  type UseSessionsDeps,
} from './useSessions';

// --- Pure helper tests ---

describe('normalizeSessionsPayload', () => {
  test('parses array of session objects', () => {
    const result = normalizeSessionsPayload([
      { id: 's1', title: 'First' },
      { id: 's2', title: '' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 's1', title: 'First', boundConnectionId: undefined });
    expect(result[1]).toEqual({ id: 's2', title: undefined, boundConnectionId: undefined });
  });

  test('parses { sessions: [...] } wrapper', () => {
    const result = normalizeSessionsPayload({ sessions: [{ id: 's1', title: 'A' }] });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('s1');
  });

  test('filters out items without id', () => {
    const result = normalizeSessionsPayload([{ title: 'no-id' }, { id: '', title: 'empty' }, { id: 's1' }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('s1');
  });

  test('filters out non-object items', () => {
    const result = normalizeSessionsPayload([null, 42, 'str', { id: 's1' }]);
    expect(result).toHaveLength(1);
  });

  test('returns empty for non-array non-object', () => {
    expect(normalizeSessionsPayload(null)).toEqual([]);
    expect(normalizeSessionsPayload(42)).toEqual([]);
    expect(normalizeSessionsPayload('str')).toEqual([]);
  });

  test('preserves boundConnectionId', () => {
    const result = normalizeSessionsPayload([{ id: 's1', boundConnectionId: 'c1' }]);
    expect(result[0]?.boundConnectionId).toBe('c1');
  });
});

describe('normalizeMessagesPayload', () => {
  test('parses array of message objects', () => {
    const result = normalizeMessagesPayload([
      { info: { id: 'm1', role: 'user' }, parts: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.info.id).toBe('m1');
    expect(result[0]?.parts).toHaveLength(1);
  });

  test('parses { messages: [...] } wrapper', () => {
    const result = normalizeMessagesPayload({
      messages: [{ info: { id: 'm1', role: 'assistant' }, parts: [] }],
    });
    expect(result).toHaveLength(1);
  });

  test('filters out items missing id or role', () => {
    const result = normalizeMessagesPayload([
      { info: { id: '', role: 'user' }, parts: [] },
      { info: { id: 'm1', role: '' }, parts: [] },
      { info: { id: 'm2', role: 'user' }, parts: [] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.info.id).toBe('m2');
  });
});

describe('extractSessionId', () => {
  test('extracts id from object', () => {
    expect(extractSessionId({ id: 'abc' })).toBe('abc');
  });
  test('returns empty for non-object', () => {
    expect(extractSessionId(null)).toBe('');
    expect(extractSessionId('str')).toBe('');
  });
  test('returns empty for missing id', () => {
    expect(extractSessionId({ name: 'x' })).toBe('');
  });
});

describe('asObject', () => {
  test('returns object for plain objects', () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
  });
  test('returns null for arrays', () => {
    expect(asObject([1, 2])).toBeNull();
  });
  test('returns null for primitives', () => {
    expect(asObject(null)).toBeNull();
    expect(asObject(42)).toBeNull();
    expect(asObject('')).toBeNull();
  });
});

describe('asString', () => {
  test('returns string as-is', () => {
    expect(asString('hello')).toBe('hello');
  });
  test('returns empty for non-strings', () => {
    expect(asString(42)).toBe('');
    expect(asString(null)).toBe('');
    expect(asString(undefined)).toBe('');
  });
});

// --- Composable integration tests ---

function makeDeps(overrides: Partial<UseSessionsDeps> = {}): UseSessionsDeps {
  return {
    activeConnectionId: ref('c1'),
    connected: ref(false),
    sessionId: ref(''),
    apiFetchForConnection: mock(() => Promise.reject(new Error('not mocked'))),
    resolveExecutionConnectionId: () => 'c1',
    syncConnectionContext: mock(() => {}),
    pushNotification: mock(() => {}),
    refreshComposerMetadata: mock(() => Promise.resolve()),
    workspacesStore: { lastSessionFor: () => '', setLastSession: mock(() => {}) },
    router: { replace: mock(() => {}) },
    route: { query: {} },
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

describe('runSessionAction', () => {
  test('sets actionWorking/actionStatus on success', async () => {
    const deps = makeDeps({
      sessionId: ref('s1'),
      apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse({ ok: true }))),
    });
    const s = useSessions(deps);

    const result = await s.runSessionAction('summarize');

    expect(result).toEqual({ ok: true });
    expect(s.sessionActionWorking.value).toBe(false);
    expect(s.sessionActionStatus.value).toBe('summarize complete');
  });

  test('sets error status on failure', async () => {
    const deps = makeDeps({
      sessionId: ref('s1'),
      apiFetchForConnection: mock(() => Promise.resolve(mockFetchResponse('Server error', false, 500))),
    });
    const s = useSessions(deps);

    const result = await s.runSessionAction('fork');

    expect(result).toBeNull();
    expect(s.sessionActionWorking.value).toBe(false);
    expect(s.sessionActionStatus.value).toBe('Server error');
    expect(deps.pushNotification).toHaveBeenCalledWith('error', 'Server error');
  });

  test('returns null when no connection', async () => {
    const deps = makeDeps({
      sessionId: ref('s1'),
      resolveExecutionConnectionId: () => '',
    });
    const s = useSessions(deps);

    const result = await s.runSessionAction('share');

    expect(result).toBeNull();
    expect(s.sessionActionWorking.value).toBe(false);
  });
});

describe('loadSessionsForConnection', () => {
  test('sets sessions and connected on success', async () => {
    const deps = makeDeps({
      apiFetchForConnection: mock(() =>
        Promise.resolve(mockFetchResponse({ sessions: [{ id: 's1', title: 'Test' }] })),
      ),
    });
    const s = useSessions(deps);

    await s.loadSessionsForConnection('c1');

    expect(s.sessions.value).toHaveLength(1);
    expect(s.sessions.value[0]?.id).toBe('s1');
    expect(deps.connected.value).toBe(true);
    expect(s.sessionManager.loading).toBe(false);
    expect(s.sessionManager.error).toBe('');
  });

  test('sets error and disconnected on failure', async () => {
    const deps = makeDeps({
      apiFetchForConnection: mock(() =>
        Promise.resolve(mockFetchResponse('Network error', false, 500)),
      ),
    });
    const s = useSessions(deps);

    await s.loadSessionsForConnection('c1');

    expect(s.sessions.value).toHaveLength(0);
    expect(deps.connected.value).toBe(false);
    expect(s.sessionManager.loading).toBe(false);
    expect(s.sessionManager.error).toBe('Network error');
  });

  test('sets loading during fetch', async () => {
    let resolvePromise: (v: Response) => void;
    const pending = new Promise<Response>((r) => { resolvePromise = r; });
    const deps = makeDeps({
      apiFetchForConnection: mock(() => pending),
    });
    const s = useSessions(deps);

    const promise = s.loadSessionsForConnection('c1');
    expect(s.sessionManager.loading).toBe(true);

    resolvePromise!(mockFetchResponse({ sessions: [] }));
    await promise;
    expect(s.sessionManager.loading).toBe(false);
  });
});

describe('loadSessionForConnection', () => {
  test('auto-creates a session when list is empty', async () => {
    let listCalls = 0;
    const apiFetchForConnection = mock((_cid: string, url: string, opts?: RequestInit) => {
      const method = (opts?.method || 'GET').toUpperCase();

      if (url.endsWith('/sessions') && method === 'GET') {
        listCalls += 1;
        if (listCalls === 1) {
          return Promise.resolve(mockFetchResponse({ sessions: [] }));
        }
        return Promise.resolve(mockFetchResponse({ sessions: [{ id: 's-auto', title: 'Auto' }] }));
      }

      if (url.endsWith('/sessions') && method === 'POST') {
        return Promise.resolve(mockFetchResponse({ id: 's-auto' }));
      }

      if (url.includes('/bind') && method === 'POST') {
        return Promise.resolve(mockFetchResponse({ ok: true }));
      }

      if (url.includes('/messages?limit=')) {
        return Promise.resolve(mockFetchResponse([]));
      }

      return Promise.resolve(mockFetchResponse({}));
    });

    const sessionId = ref('');
    const deps = makeDeps({
      sessionId,
      apiFetchForConnection,
    });
    const s = useSessions(deps);

    await s.loadSessionForConnection('c1');

    expect(sessionId.value).toBe('s-auto');
    expect(s.sessions.value.map((item) => item.id)).toEqual(['s-auto']);
    expect(deps.connected.value).toBe(true);
    expect(apiFetchForConnection).toHaveBeenCalled();
  });
});
