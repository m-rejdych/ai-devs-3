import type OpenAI from 'openai';

import { openai } from '@/clients/openai';

interface GetChatCompletionBaseArgs {
  context?: string;
  model?: OpenAI.ChatCompletionCreateParams['model'];
  temperature?: number;
}

interface GetChatCompletionQueryArgs extends GetChatCompletionBaseArgs {
  query: string;
}

interface GetChatCompletionMessagesArgs extends GetChatCompletionBaseArgs {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

type GetChatCompletionArgs = GetChatCompletionQueryArgs | GetChatCompletionMessagesArgs;

export async function getChatCompletion({
  context,
  model = 'gpt-4o',
  temperature = 0.3,
  ...args
}: GetChatCompletionArgs): Promise<string | null> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (context) {
    messages.push({ role: 'system', content: context });
  }

  if ('messages' in args) {
    messages.push(...args.messages);
  } else {
    messages.push({ role: 'user', content: args.query });
  }

  const response = await openai.chat.completions.create({
    model,
    temperature,
    messages,
  });

  return response.choices[0]?.message.content ?? null;
}
