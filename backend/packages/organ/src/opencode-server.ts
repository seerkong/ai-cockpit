/**
 * OpenCode Server Manager
 * Spawns and manages the OpenCode server process
 */

import { spawn, type Subprocess } from 'bun';
import os from 'node:os';
import path from 'node:path';

export interface OpenCodeServerInfo {
  baseUrl: string;
  serverPassword: string;
  process: Subprocess;
}

async function pickFreePort(): Promise<number> {
  const server = Bun.serve({
    port: 0,
    fetch() {
      return new Response('');
    },
  });
  const port = server.port;
  server.stop();
  return port;
}

/**
 * Spawn an OpenCode server and wait for it to be ready
 */
export async function spawnOpenCodeServer(
  directory: string,
  options?: {
    autoApprove?: boolean;
    timeoutMs?: number;
  }
): Promise<OpenCodeServerInfo> {
  const serverPassword = '';
  const timeoutMs = options?.timeoutMs ?? 300000;
  const port = await pickFreePort();

  // Build environment
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NPM_CONFIG_LOGLEVEL: 'error',
    NODE_NO_WARNINGS: '1',
    NO_COLOR: '1',
    ...(serverPassword ? { OPENCODE_SERVER_PASSWORD: serverPassword } : {}),
  };

  // Ensure XDG config resolution works consistently (especially on Windows).
  // OpenCode uses XDG_CONFIG_HOME when present; default is typically ~/.config.
  if (!env.XDG_CONFIG_HOME) {
    env.XDG_CONFIG_HOME = path.join(os.homedir(), '.config');
  }

  // Set permissions - deny question prompts, optionally auto-approve tools
  if (options?.autoApprove) {
    env.OPENCODE_PERMISSION = JSON.stringify({ question: 'deny' });
  } else {
    env.OPENCODE_PERMISSION = JSON.stringify({
      edit: 'ask',
      bash: 'ask',
      webfetch: 'ask',
      doom_loop: 'ask',
      external_directory: 'ask',
      question: 'deny',
    });
  }

  // Spawn the OpenCode server
  // On Windows, we need to use npx.cmd or run through cmd.exe
  const isWindows = process.platform === 'win32';
  const cmd = isWindows 
    ? ['cmd', '/c', 'npx', '-y', 'opencode-ai@latest', 'serve', '--hostname', '127.0.0.1', '--port', String(port)]
    : ['npx', '-y', 'opencode-ai@latest', 'serve', '--hostname', '127.0.0.1', '--port', String(port)];
  
  const proc = spawn({
    cmd,
    cwd: directory,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    serverPassword,
    process: proc,
  };
}

/**
 * Wait for the OpenCode server to print its listening URL
 */
async function waitForServerUrl(proc: Subprocess, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const stdout = proc.stdout;
  const stderr = proc.stderr;
  
  if ((!stdout || typeof stdout === 'number') && (!stderr || typeof stderr === 'number')) {
    throw new Error('OpenCode server missing stdio');
  }

  const stdoutReader = stdout && typeof stdout !== 'number'
    ? (stdout as ReadableStream<Uint8Array>).getReader()
    : null;
  const stderrReader = stderr && typeof stderr !== 'number'
    ? (stderr as ReadableStream<Uint8Array>).getReader()
    : null;

  const decoder = new TextDecoder();
  let stdoutBuffer = '';
  let stderrBuffer = '';
  const captured: string[] = [];

  async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array> | null) {
    if (!reader) return { done: true, value: undefined, source: 'none' as const };
    const result = await reader.read();
    return { ...result, source: reader === stdoutReader ? 'stdout' as const : 'stderr' as const };
  }

  function handleLines(source: 'stdout' | 'stderr', buffer: string) {
    const lines = buffer.split('\n');
    const remainder = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (captured.length < 64) {
        captured.push(`[${source}] ${trimmed}`);
      }
      const match = trimmed.match(/https?:\/\/127\.0\.0\.1:\d+/i) || trimmed.match(/listening on\s+(https?:\/\/\S+)/i);
      if (match?.[1]) {
        return { url: match[1], remainder };
      }
      if (match?.[0]) {
        return { url: match[0], remainder };
      }
    }
    return { url: '', remainder };
  }

  try {
    while (Date.now() < deadline) {
      const timeoutPromise = new Promise<{ done: true; value: undefined; source: 'none' }>((resolve) => {
        setTimeout(() => resolve({ done: true, value: undefined, source: 'none' }), Math.max(0, deadline - Date.now()));
      });

      const { done, value, source } = await Promise.race([
        readChunk(stdoutReader),
        readChunk(stderrReader),
        timeoutPromise,
      ]);

      if (done && !value) {
        if (proc.exitCode !== null) {
          throw new Error(
            `OpenCode server exited before printing listening URL.\nServer output tail:\n${formatTail(captured)}`
          );
        }
        continue;
      }

      if (value) {
        const text = decoder.decode(value, { stream: true });
        if (source === 'stderr') {
          stderrBuffer += text;
          const { url, remainder } = handleLines('stderr', stderrBuffer);
          stderrBuffer = remainder;
          if (url) return url;
        } else {
          stdoutBuffer += text;
          const { url, remainder } = handleLines('stdout', stdoutBuffer);
          stdoutBuffer = remainder;
          if (url) return url;
        }
      }
    }

    throw new Error(
      `Timed out waiting for OpenCode server to print listening URL.\nServer output tail:\n${formatTail(captured)}`
    );
  } finally {
    stdoutReader?.releaseLock();
    stderrReader?.releaseLock();
  }
}

function formatTail(captured: string[]): string {
  return captured.slice(-12).join('\n');
}

/**
 * Kill the OpenCode server process
 */
export function killOpenCodeServer(server: OpenCodeServerInfo): void {
  try {
    server.process.kill();
  } catch {
    // Ignore errors
  }
}
