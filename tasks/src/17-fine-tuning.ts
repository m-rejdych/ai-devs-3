import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import type { OpenAI } from 'openai';

import { openai } from '@/clients/openai';

function createJsonlLine(
  value: string,
  correctness: 'correct' | 'incorrect',
): { messages: OpenAI.Chat.ChatCompletionMessageParam[] } {
  return {
    messages: [
      { role: 'system', content: 'Determine if set of four numbers follows specific pattern.' },
      { role: 'user', content: value },
      { role: 'assistant', content: correctness },
    ],
  };
}

async function main(): Promise<void> {
  try {
    const labDataPath = path.join(process.cwd(), '..', 'resources', 'lab-data');

    const correctFile = (await readFile(path.join(labDataPath, 'correct.txt')))
      .toString()
      .trim();
    const incorrectFile = (await readFile(path.join(labDataPath, 'incorrect.txt')))
      .toString()
      .trim();

    const correctLines = correctFile.split(/\r?\n/);
    const incorrectLines = incorrectFile.split(/\r?\n/);

    const jsonlData = [
      ...correctLines.map((line) => JSON.stringify(createJsonlLine(line, 'correct'))),
      ...incorrectLines.map((line) => JSON.stringify(createJsonlLine(line, 'incorrect'))),
    ];

    const trainingDataFilePath = path.join(
      labDataPath,
      'lab-data-verification-training-data.jsonl',
    );
    if (existsSync(trainingDataFilePath)) {
      console.log('TRAINING DATA ALREADY EXISTS');
      return;
    }

    await writeFile(trainingDataFilePath, jsonlData.join('\n'));

    const openaiFile = await openai.files.create({
      purpose: 'fine-tune',
      file: createReadStream(trainingDataFilePath),
    });

    const fineTuning = await openai.fineTuning.jobs.create({
      model: 'gpt-4o-mini-2024-07-18',
      suffix: 'lab-data-verification',
      training_file: openaiFile.id,
    });
    console.log('FINE TUNING STATUS: ', fineTuning.status);
  } catch (error) {
    console.log(error);
  }
}

main();
