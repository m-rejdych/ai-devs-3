import { createReadStream } from 'fs';
import type OpenAI from 'openai';

import { openai } from '@/clients/openai';

interface GetChatCompletionBaseArgs {
  context?: string;
  model?: OpenAI.ChatCompletionCreateParams['model'];
  temperature?: OpenAI.ChatCompletionCreateParams['temperature'];
}

interface GetChatCompletionQueryArgs extends GetChatCompletionBaseArgs {
  query: string;
}

interface GetChatCompletionMessagesArgs extends GetChatCompletionBaseArgs {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}

type GetChatCompletionArgs = GetChatCompletionQueryArgs | GetChatCompletionMessagesArgs;

interface GetTranscriptionArgs {
  filePath: string;
  model?: OpenAI.Audio.TranscriptionCreateParams['model'];
  language?: OpenAI.Audio.TranscriptionCreateParams['language'];
  temperature?: OpenAI.Audio.TranscriptionCreateParams['temperature'];
}

export async function getChatCompletion({
  context,
  model = 'gpt-4o-mini',
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

export async function getTranscription({
  filePath,
  model = 'whisper-1',
  language = 'pl',
  ...rest
}: GetTranscriptionArgs): Promise<string> {
  const { text } = await openai.audio.transcriptions.create({
    file: createReadStream(filePath),
    model,
    language,
    ...rest,
  });

  return text;
}

export async function getTranscriptionCompletion(
  transcriptionArgs: GetTranscriptionArgs,
  completionParams?: GetChatCompletionBaseArgs,
): Promise<string | null> {
  const transcription = await getTranscription(transcriptionArgs);

  return getChatCompletion({ query: transcription, ...completionParams });
}

export async function getImagesCompletion(
  base64ImagesUrls: string[],
  { query, ...completionArgs }: Partial<GetChatCompletionQueryArgs> = {},
): Promise<string | null> {
  const messageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  if (query) {
    messageContents.push({ type: 'text', text: query });
  }

  base64ImagesUrls.forEach((base64ImageUrl) => {
    messageContents.push({ type: 'image_url', image_url: { url: base64ImageUrl } });
  });

  return getChatCompletion({
    messages: [{ role: 'user', content: messageContents }],
    ...completionArgs,
  });
}

export async function createEmbedding(
  text: string,
  model: OpenAI.EmbeddingCreateParams['model'] = 'text-embedding-3-small',
): Promise<number[] | null> {
  const embedding = await openai.embeddings.create({ input: text, model });

  return embedding.data[0]?.embedding ?? null;
}
