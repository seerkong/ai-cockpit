import type { ProviderCapabilities, WorkspaceProvider } from '@backend/core'

import { OpenCodeClient } from '../opencode-client'
import { spawnOpenCodeServer, type OpenCodeServerInfo } from '../opencode-server'
import { OpenCodeLocalProvider } from './opencode-local'
import { OpenCodeLocalPortProvider } from './opencode-local-port'

export class OpenCodeLazyProvider implements WorkspaceProvider {
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

  private mode: 'spawn' | 'port'
  private serverPort?: number
  private autoApprove: boolean
  private server: OpenCodeServerInfo | null = null
  private delegate: WorkspaceProvider | null = null
  private connectInFlight: Promise<void> | null = null

  constructor(input: {
    directory: string
    mode: 'spawn' | 'port'
    serverPort?: number
    autoApprove?: boolean
  }) {
    this.directory = input.directory
    this.mode = input.mode
    this.serverPort = input.serverPort
    this.autoApprove = Boolean(input.autoApprove)
  }

  private async ensureConnected(): Promise<void> {
    if (this.delegate) return
    if (this.connectInFlight) return this.connectInFlight

    this.connectInFlight = (async () => {
      if (this.delegate) return

      if (this.mode === 'port') {
        const port = Number(this.serverPort)
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error('invalid server port')
        }
        const baseUrl = `http://127.0.0.1:${port}`
        const client = new OpenCodeClient({ baseUrl, directory: this.directory, serverPassword: '' })
        const healthy = await client.waitForHealth()
        if (!healthy) throw new Error('OpenCode server failed health check')
        this.delegate = new OpenCodeLocalPortProvider({ directory: this.directory, baseUrl })
        return
      }

      const server = await spawnOpenCodeServer(this.directory, { autoApprove: this.autoApprove })
      const client = new OpenCodeClient({
        baseUrl: server.baseUrl,
        directory: this.directory,
        serverPassword: server.serverPassword,
      })
      const healthy = await client.waitForHealth(300000)
      if (!healthy) {
        try {
          server.process.kill()
        } catch {
          // ignore
        }
        throw new Error('OpenCode server failed health check')
      }

      this.server = server
      this.delegate = new OpenCodeLocalProvider({ directory: this.directory, server })
    })().finally(() => {
      this.connectInFlight = null
    })

    return this.connectInFlight
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    await this.ensureConnected()
    if (!this.delegate) throw new Error('provider not connected')
    return this.delegate.request(path, init)
  }

  async proxy(req: Request, targetPath: string): Promise<Response> {
    await this.ensureConnected()
    if (!this.delegate) throw new Error('provider not connected')
    return this.delegate.proxy(req, targetPath)
  }

  dispose() {
    try {
      this.delegate?.dispose()
    } catch {
      // ignore
    }
    this.delegate = null
    this.server = null
  }
}
