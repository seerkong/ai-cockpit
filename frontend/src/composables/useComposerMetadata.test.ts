import { describe, expect, test } from 'bun:test';
import { useComposerMetadata } from './useComposerMetadata';

describe('useComposerMetadata', () => {
  test('clears metadata lists when corresponding capabilities are disabled', async () => {
    const { capabilities, agentOptions, commandOptions, modelOptions, refreshComposerMetadata } = useComposerMetadata({
      apiFetchForConnection: async () => new Response('[]', { status: 200 }),
    });

    capabilities.value = { agents: false, commands: false, models: false };
    await refreshComposerMetadata('c1');

    expect(agentOptions.value).toEqual([]);
    expect(commandOptions.value).toEqual([]);
    expect(modelOptions.value).toEqual([]);
  });

  test('normalizes agents, commands and models payloads', async () => {
    const apiFetchForConnection = async (_connectionId: string, url: string) => {
      if (url.endsWith('/agents')) {
        return new Response(
          JSON.stringify({ agents: [{ name: 'dev' }, { name: 'hidden-agent', hidden: true }] }),
          { status: 200 },
        );
      }

      if (url.endsWith('/commands')) {
        return new Response(JSON.stringify({ commands: [{ name: 'check', description: 'Run check' }] }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          providers: [
            {
              providerID: 'openai',
              models: [{ modelID: 'gpt-4.1', modelName: 'GPT 4.1' }],
            },
          ],
        }),
        { status: 200 },
      );
    };

    const { capabilities, agentOptions, commandOptions, modelOptions, refreshComposerMetadata } = useComposerMetadata({
      apiFetchForConnection,
    });

    capabilities.value = { agents: true, commands: true, models: true };
    await refreshComposerMetadata('c1');

    expect(agentOptions.value.map((item) => item.name)).toEqual(['dev']);
    expect(commandOptions.value.map((item) => item.name)).toEqual(['check']);
    expect(modelOptions.value.map((item) => item.label)).toEqual(['openai/gpt-4.1']);
  });
});
