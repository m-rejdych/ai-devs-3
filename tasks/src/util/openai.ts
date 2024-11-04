import type OpenAI from 'openai';

import { openai } from '@/clients/openai';

interface GetChatCompletionArgs {
  query: string;
  context?: string;
  model?: OpenAI.ChatCompletionCreateParams['model'];
  temperature?: number;
}

export async function getChatCompletion({
  query,
  context,
  model = 'gpt-4o-mini',
  temperature = 0.3,
}: GetChatCompletionArgs): Promise<string | null> {
  const messages: OpenAI.ChatCompletionCreateParams['messages'] = [];

  if (context) {
    messages.push({ role: 'system', content: context });
  }

  messages.push({ role: 'user', content: query });

  const response = await openai.chat.completions.create({
    model,
    temperature,
    messages,
  });

  return response.choices[0]?.message.content ?? null;
}
