import type { ProviderCapabilities, WorkspaceProvider } from './types'

export class OpenCodeLocalPortProvider implements WorkspaceProvider {
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

  private baseUrl: string

  constructor(input: { directory: string; baseUrl: string }) {
    this.directory = input.directory
    this.baseUrl = input.baseUrl
  }

  private buildHeaders(extra?: HeadersInit) {
    const headers = new Headers(extra ?? {})
    headers.set('x-opencode-directory', this.directory)
    return headers
  }

  async request(path: string, init: RequestInit = {}) {
    const targetUrl = new URL(this.baseUrl + path)
    const headers = this.buildHeaders(init.headers)
    return fetch(targetUrl, {
      ...init,
      headers,
    })
  }

  async proxy(req: Request, targetPath: string) {
    const srcUrl = new URL(req.url)
    const targetUrl = new URL(this.baseUrl + targetPath)
    targetUrl.search = srcUrl.search

    const headers = this.buildHeaders(req.headers)
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
    // Intentionally do not terminate the external server.
  }
}
