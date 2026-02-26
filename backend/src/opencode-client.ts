/**
 * OpenCode SDK Client
 * Handles communication with OpenCode server via HTTP and SSE
 */

import type { OpencodeEvent } from 'shared';
import { ulid } from './ulid';

export interface OpenCodeConfig {
  baseUrl: string;
  directory: string;
  serverPassword?: string;
}

export interface SessionInfo {
  id: string;
}

export class OpenCodeClient {
  private config: OpenCodeConfig;
  private headers: Headers;
  private abortController: AbortController | null = null;

  constructor(config: OpenCodeConfig) {
    this.config = config;
    this.headers = this.buildHeaders();
  }

  private buildHeaders(): Headers {
    const headers = new Headers();
    headers.set('x-opencode-directory', this.config.directory);

    // Basic auth is used only when the server is started with a password.
    if (this.config.serverPassword) {
      const credentials = btoa(`opencode:${this.config.serverPassword}`);
      headers.set('Authorization', `Basic ${credentials}`);
    }
    headers.set('Content-Type', 'application/json');
    
    return headers;
  }

  /**
   * Wait for OpenCode server to be healthy
   */
  async waitForHealth(timeoutMs: number = 20000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    
    while (Date.now() < deadline) {
      try {
        const resp = await fetch(`${this.config.baseUrl}/global/health`, {
          headers: this.headers,
        });
        
        if (resp.ok) {
          try {
            const body = await resp.json();
            if (body?.healthy) {
              return true;
            }
          } catch {
            return true;
          }
          return true;
        }
      } catch {
        // Retry
      }
      
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    return false;
  }

  /**
   * Create a new session
   */
  async createSession(): Promise<SessionInfo> {
    const resp = await fetch(
      `${this.config.baseUrl}/session?directory=${encodeURIComponent(this.config.directory)}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({}),
      }
    );

    if (!resp.ok) {
      throw new Error(`Failed to create session: HTTP ${resp.status}`);
    }

    return await resp.json();
  }

  /**
   * Fork an existing session (for follow-up messages)
   */
  async forkSession(sessionId: string): Promise<SessionInfo> {
    const resp = await fetch(
      `${this.config.baseUrl}/session/${sessionId}/fork?directory=${encodeURIComponent(this.config.directory)}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({}),
      }
    );

    if (!resp.ok) {
      throw new Error(`Failed to fork session: HTTP ${resp.status}`);
    }

    return await resp.json();
  }

  /**
   * Send a prompt to a session
   */
  async sendPrompt(
    sessionId: string,
    prompt: string,
    options?: {
      model?: { providerID: string; modelID: string };
      agent?: string;
    }
  ): Promise<void> {
    const body = {
      model: options?.model,
      agent: options?.agent,
      parts: [{ type: 'text', text: prompt }],
    };

    const resp = await fetch(
      `${this.config.baseUrl}/session/${sessionId}/message?directory=${encodeURIComponent(this.config.directory)}`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to send prompt: HTTP ${resp.status} ${text}`);
    }

    const result = await resp.json();
    
    // Check for error response
    if (result.name && result.data?.message) {
      throw new Error(`OpenCode error: ${result.name}: ${result.data.message}`);
    }
  }

  /**
   * Abort a running session
   */
  async abort(sessionId: string): Promise<void> {
    try {
      await fetch(
        `${this.config.baseUrl}/session/${sessionId}/abort?directory=${encodeURIComponent(this.config.directory)}`,
        {
          method: 'POST',
          headers: this.headers,
        }
      );
    } catch {
      // Ignore abort errors
    }
  }

  /**
   * Connect to the SSE event stream
   */
  async *streamEvents(sessionId: string): AsyncGenerator<OpencodeEvent> {
    this.abortController = new AbortController();
    
    const headers = new Headers(this.headers);
    headers.set('Accept', 'text/event-stream');

    console.log('Connecting to SSE event stream:', `${this.config.baseUrl}/event`);

    const resp = await fetch(
      `${this.config.baseUrl}/event?directory=${encodeURIComponent(this.config.directory)}`,
      {
        headers,
        signal: this.abortController.signal,
      }
    );

    if (!resp.ok) {
      throw new Error(`Failed to connect to event stream: HTTP ${resp.status}`);
    }

    console.log('SSE event stream connected');

    const reader = resp.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('SSE stream ended (done=true)');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        let eventData = '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            eventData += line.slice(6);
          } else if (line === '' && eventData) {
            // End of event
            try {
              const event = JSON.parse(eventData) as OpencodeEvent;
              
              // Filter events for this session
              if (this.eventMatchesSession(event, sessionId)) {
                yield event;
                
                // Check for session.idle to know when done
                if (event.type === 'session.idle') {
                  console.log('Received session.idle, ending stream');
                  return;
                }
              }
            } catch {
              // Skip invalid JSON
              console.log('Failed to parse SSE event data:', eventData.slice(0, 100));
            }
            eventData = '';
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stop the event stream
   */
  stopEventStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if an event belongs to the given session
   */
  private eventMatchesSession(event: OpencodeEvent, sessionId: string): boolean {
    const props = event.properties as Record<string, unknown> | undefined;
    if (!props) return false;

    // Different event types store sessionID in different places
    const extractedSessionId = 
      (props.sessionID as string) ||
      ((props.info as Record<string, unknown>)?.sessionID as string) ||
      ((props.part as Record<string, unknown>)?.sessionID as string);

    return extractedSessionId === sessionId;
  }
}

/**
 * Generate a random server password
 */
export function generateServerPassword(): string {
  // 80 bits of randomness is sufficient for a local server password.
  return ulid();
}
