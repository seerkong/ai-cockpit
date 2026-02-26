import { killOpenCodeServer, type OpenCodeServerInfo } from '../opencode-server'
import type { ProviderCapabilities, WorkspaceProvider } from './types'

function base64BasicAuth(user: string, pass: string) {
  return btoa(`${user}:${pass}`)
}

export class OpenCodeLocalProvider implements WorkspaceProvider {
  readonly providerType = 'opencode.local'
  readonly directory: string
  readonly capabilities: ProviderCapabilities = {
    chat: true,
    events: true,
    reviewDiffs: true,
    inlineComments: true,
    fileRead: true,
    fileSearch: true,
    commands: true,
    agents: true,
    models: true,
    permissions: true,
    questions: true,
  }

  private server: OpenCodeServerInfo

  constructor(input: { directory: string; server: OpenCodeServerInfo }) {
    this.directory = input.directory
    this.server = input.server
  }

  private buildAuthHeaders(extra?: HeadersInit) {
    const headers = new Headers(extra ?? {})
    headers.set('x-opencode-directory', this.directory)
    headers.set('Authorization', `Basic ${base64BasicAuth('opencode', this.server.serverPassword)}`)
    return headers
  }

  async request(path: string, init: RequestInit = {}) {
    const targetUrl = new URL(this.server.baseUrl + path)
    const headers = this.buildAuthHeaders(init.headers)
    return fetch(targetUrl, {
      ...init,
      headers,
    })
  }

  async proxy(req: Request, targetPath: string) {
    const srcUrl = new URL(req.url)
    const targetUrl = new URL(this.server.baseUrl + targetPath)
    targetUrl.search = srcUrl.search

    const headers = this.buildAuthHeaders(req.headers)
    headers.delete('host')

    const method = req.method.toUpperCase()
    const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer()

    return fetch(targetUrl, {
      method,
      headers,
      body,
      signal: req.signal,
    })
  }

  dispose() {
    killOpenCodeServer(this.server)
  }
}
