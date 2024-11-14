import { readdir, readFile, writeFile } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import type OpenAI from 'openai';

import { openai } from '@/clients/openai';
import { getChatCompletion } from '@/util/openai';
import { extractJsonObj, isResultObj } from '@/util/formatting';
import { submit } from '@/util/tasks';

const CONTEXT =
  `You will be provided with a couple of statements in Polish language made by some people. Your job is to gather information from these statements, that will allow you to answer the question (in Polish): "Jaka jest nazwa ulicy, na której znajduje się departament uczelni, na którym wykłada Profesor Andrzej Maj?"

<main_question>
  Jaka jest nazwa ulicy, na której znajduje się departament uczelni, na którym wykłada Profesor Andrzej Maj?
</main_question>

<rules>
  - Analyse one statement at the time.
  - After each statement, think about it, and output a brief conclusion / reasoning, that you have about the statement
  - Pay special attention to things like city names, university names, departament names
  - Decide if the statement is valid - determine if the person is worth considering, if there are any suspicious things like unconscious talking, hate from the person, etc. about it. If so, ignore it.
  - The street name of the university departament will likely not directly provided in the statements. You need to figure out, what is the street name, based only on information you have and information about the university and it's departament from the statements.
  - After you are done with iterating over statements, print a summary, that consists only of valid information and is helpful to answer the main question. Focus on the city, university name and departament name.
  - After outputting the summary, try to figure out what is the street of university departament, that Andrzej Maj teaches on.
  - Once you figured out university and departament name, output street name of the departament, that might not be directly included in statements and use it as final response
  - IMPORTANT: You need to respond with the name of the street of specific university departament, not the university itself
</rules>

<reasoning_format>
  **{number wypowiedzi} wypowiedź**: "reasoning"
</reasoning_format>

<final_response_format>
  {
    "result": "{street name of the university departament}"
  }
</final_response_format>` as const;

async function main(): Promise<void> {
  try {
    const audioDirPath = path.join(process.cwd(), '..', 'resources', 'audio');
    const transcriptionsPath = path.join(process.cwd(), '..', 'resources', 'transcriptions.json');

    const files = await readdir(audioDirPath);
    const transcriptions = existsSync(transcriptionsPath)
      ? await readFile(transcriptionsPath)
      : null;
    const parsedTranscriptions = transcriptions ? JSON.parse(transcriptions.toString()) : {};

    await Promise.all(
      files
        .filter((file) => !(file.slice(0, -4) in parsedTranscriptions))
        .map(async (file) => {
          const transcription: OpenAI.Audio.Transcription =
            await openai.audio.transcriptions.create({
              file: createReadStream(path.join(audioDirPath, file)),
              model: 'whisper-1',
              language: 'pl',
            });

          parsedTranscriptions[file.slice(0, -4)] = transcription.text;
        }),
    );

    await writeFile(transcriptionsPath, JSON.stringify(parsedTranscriptions));

    const query = Object.values(parsedTranscriptions).reduce<string>(
      (acc, transcription) => acc + `\n- ${transcription}`,
      '',
    );

    const completion = await getChatCompletion({ query, context: CONTEXT });
    if (!completion) {
      throw new Error('Completion unsuccessful.');
    }
    console.log('COMPLETION', completion);

    const json = extractJsonObj(completion);
    if (!json) {
      throw new Error('Invalid completion.');
    }

    if (!isResultObj(json)) {
      throw new Error('Invalid completion.');
    }
    console.log('ANSWER', json.result);

    const result = await submit('mp3', json.result);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
