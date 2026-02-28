import type { ProviderCapabilities } from 'shared'

export type { ProviderCapabilities } from 'shared'

export interface WorkspaceProvider {
  readonly providerType: string
  readonly directory: string
  readonly capabilities: ProviderCapabilities

  /**
   * Low-level request helper for adapters that want to call upstream APIs.
   * The caller passes a provider-specific path (including any query string).
   */
  request(path: string, init?: RequestInit): Promise<Response>

  /**
   * Raw proxy helper. Used to preserve existing `/api/opencode/*` behavior.
   */
  proxy(req: Request, targetPath: string): Promise<Response>

  /** Stop any underlying resources (local processes, streams, etc). */
  dispose(): void
}
