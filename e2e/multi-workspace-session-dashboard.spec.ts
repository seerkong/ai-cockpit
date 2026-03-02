import { expect, test } from '@playwright/test'

const workspaceId = 'ws_multi_1'
const token = 'tok_multi_1'
const demoPath = '/Users/peacock/tmp/demo'

function capabilities() {
  return {
    chat: true,
    events: true,
    reviewDiffs: false,
    inlineComments: false,
    fileRead: false,
    fileSearch: false,
    commands: true,
    agents: false,
    models: false,
    permissions: false,
    questions: false,
  }
}

async function installRealtimeSocketStub(page: Parameters<typeof test>[0]['page']) {
  await page.addInitScript(() => {
    const RealWebSocket = window.WebSocket
    class FakeRealtimeWebSocket {
      readyState = 0
      onopen: ((ev: Event) => void) | null = null
      onmessage: ((ev: MessageEvent) => void) | null = null
      onerror: ((ev: Event) => void) | null = null
      onclose: ((ev: CloseEvent) => void) | null = null

      constructor(_url: string) {
        setTimeout(() => {
          this.readyState = 1
          this.onopen?.(new Event('open'))
        }, 0)
      }

      send(_data: string) {}
      close(code?: number, reason?: string) {
        this.readyState = 3
        this.onclose?.({ code, reason } as CloseEvent)
      }
    }

    const patchedWebSocket = ((url: string | URL, protocols?: string | string[]) => {
      const normalized = typeof url === 'string' ? url : url.toString()
      if (normalized.includes('/stream/ws')) {
        return new FakeRealtimeWebSocket(normalized) as unknown as WebSocket
      }
      return new RealWebSocket(url, protocols)
    }) as unknown as typeof WebSocket

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      writable: true,
      value: patchedWebSocket,
    })
  })
}

async function installMockApi(
  page: Parameters<typeof test>[0]['page'],
  options?: { initialBindings?: Record<string, string>; disableBindMutation?: boolean },
) {
  const sessions = [
    { id: 'sess_a', title: 'Session A', status: 'idle' },
    { id: 'sess_b', title: 'Session B', status: 'idle' },
  ]
  const bindings: Record<string, string> = { ...(options?.initialBindings ?? {}) }
  const promptCalls: Record<string, number> = Object.create(null)

  await page.route('**/api/v1/workspaces/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname

    const json = async (data: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data),
      })
    }

    if (path === '/api/v1/workspaces/connect') {
      await json({
        workspace: {
          id: workspaceId,
          provider: 'opencode.local',
          directory: demoPath,
          status: 'ready',
          createdAt: Date.now(),
          capabilities: capabilities(),
        },
        token,
      })
      return
    }

    if (path === `/api/v1/workspaces/${workspaceId}/sessions`) {
      if (req.method() === 'GET') {
        await json(sessions)
        return
      }
      if (req.method() === 'POST') {
        await json({ id: 'sess_new' })
        return
      }
    }

    const promptMatch = path.match(new RegExp(`^/api/v1/workspaces/${workspaceId}/sessions/([^/]+)/prompt$`))
    if (promptMatch && req.method() === 'POST') {
      const sid = promptMatch[1] ?? ''
      promptCalls[sid] = (promptCalls[sid] ?? 0) + 1
      // Mirror backend behavior: prompt execution requires session binding.
      if (!bindings[sid]) {
        await json({ error: 'session not bound to connection' }, 409)
        return
      }
      await json({ ok: true })
      return
    }

    const messageMatch = path.match(new RegExp(`^/api/v1/workspaces/${workspaceId}/sessions/([^/]+)/messages$`))
    if (messageMatch && req.method() === 'GET') {
      await json([])
      return
    }

    const sessionMatch = path.match(new RegExp(`^/api/v1/workspaces/${workspaceId}/sessions/([^/]+)$`))
    if (sessionMatch && req.method() === 'GET') {
      const sid = sessionMatch[1] ?? ''
      await json({ id: sid, title: sid })
      return
    }

    if (path === `/api/v1/workspaces/${workspaceId}/connections` && req.method() === 'GET') {
      await json({
        connections: [
          { id: workspaceId, workspaceId, directory: demoPath, label: 'conn-1', mode: 'port', status: 'idle' },
          {
            id: `${workspaceId}_2`,
            workspaceId: `${workspaceId}_2`,
            directory: demoPath,
            label: 'conn-2',
            mode: 'port',
            status: 'idle',
          },
        ],
      })
      return
    }

    if (path === `/api/v1/workspaces/${workspaceId}/session-bindings` && req.method() === 'GET') {
      await json({ bindings })
      return
    }

    const bindMatch = path.match(new RegExp(`^/api/v1/workspaces/${workspaceId}/sessions/([^/]+)/bind$`))
    if (bindMatch && req.method() === 'POST') {
      const sid = bindMatch[1] ?? ''
      if (!options?.disableBindMutation) {
        bindings[sid] = workspaceId
      }
      await json({ ok: true, sessionId: sid, boundConnectionId: workspaceId, bindings })
      return
    }

    const unbindMatch = path.match(new RegExp(`^/api/v1/workspaces/${workspaceId}/sessions/([^/]+)/unbind$`))
    if (unbindMatch && req.method() === 'POST') {
      const sid = unbindMatch[1] ?? ''
      delete bindings[sid]
      await json({ ok: true, sessionId: sid, bindings })
      return
    }

    if (path === `/api/v1/workspaces/${workspaceId}/agents`) {
      await json([])
      return
    }
    if (path === `/api/v1/workspaces/${workspaceId}/commands`) {
      await json([])
      return
    }
    if (path === `/api/v1/workspaces/${workspaceId}/models`) {
      await json({ all: [], default: {} })
      return
    }
    if (path === `/api/v1/workspaces/${workspaceId}/files`) {
      await json([])
      return
    }
    if (path === `/api/v1/workspaces/${workspaceId}/events`) {
      await route.fulfill({ status: 204, body: '' })
      return
    }

    await json({ error: `unhandled ${req.method()} ${path}` }, 404)
  })

  return {
    getPromptCalls(sessionId: string) {
      return promptCalls[sessionId] ?? 0
    },
  }
}

async function openSessionPage(page: Parameters<typeof test>[0]['page']) {
  await page.goto('/')
  await page.getByPlaceholder('Local directory path').fill(demoPath)
  await page.getByRole('button', { name: 'Add' }).click()

  // Select config so New Connection modal targets it.
  await page.getByText(demoPath, { exact: true }).first().click()

  // Navigate to the dockview session page.
  await page.getByTitle('Session Details').click()
  await page.waitForURL('**/work')

  // Create a port connection via toolbar modal.
  await page.getByRole('button', { name: 'Connection' }).click()
  await page.getByRole('button', { name: 'New Connection' }).click()
  await page.locator('#new-connection-mode').selectOption('port')
  await page.locator('#new-connection-port').fill('4096')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect
    .poll(() => new URL(page.url()).searchParams.get('connId'))
    .toBe(workspaceId)
}

test('legacy route redirects to canonical and preserves target session execution', async ({ page }) => {
  await installRealtimeSocketStub(page)
  const api = await installMockApi(page, { initialBindings: { sess_b: workspaceId } })

  await openSessionPage(page)
  await page.goto(`/workspaces/${workspaceId}/sessions/sess_b`)
  await page.waitForURL('**/work?**')
  expect(new URL(page.url()).pathname).toBe('/work')
  expect(new URL(page.url()).searchParams.get('connId')).toBe(workspaceId)
  expect(new URL(page.url()).searchParams.get('sessionId')).toBe('sess_b')

  const composer = page.locator('textarea').first()
  await composer.fill('from legacy url')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect.poll(() => api.getPromptCalls('sess_b')).toBe(1)
})

test('workspace and session context menus expose expected actions', async ({ page }) => {
  await installRealtimeSocketStub(page)
  await installMockApi(page, { initialBindings: { sess_a: workspaceId } })

  await openSessionPage(page)

  // Connection context menu (right-click on a connection row).
  await page.locator('.connections-panel .session-item').first().click({ button: 'right' })
  await expect(page.getByRole('button', { name: 'Manage sessions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible()

  // Manage sessions should open the modal.
  await page.getByRole('button', { name: 'Manage sessions' }).click()
  await expect(page.getByText('Manage Sessions')).toBeVisible()
  await expect(page.locator('.palette').getByText('Session A', { exact: true })).toBeVisible()
})

test('unbound session blocks prompt execution with guard message', async ({ page }) => {
  await installRealtimeSocketStub(page)
  // Keep bind endpoint "successful" but do not actually bind,
  // so prompt execution returns a 409 backend-style error.
  const api = await installMockApi(page, { disableBindMutation: true })

  await openSessionPage(page)
  const composer = page.locator('textarea').first()
  await composer.fill('should be blocked')
  await page.getByRole('button', { name: 'Send' }).click()

  // Current UI surfaces backend error text as sessionError.
  await expect(page.locator('.composer-status').getByText(/session not bound to connection/i).first()).toBeVisible()
  expect(api.getPromptCalls('sess_a')).toBe(1)
})
