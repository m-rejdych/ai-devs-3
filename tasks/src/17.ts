import path from 'path';
import { readFile } from 'fs/promises';

import { getChatCompletion } from '@/util/openai';
import { submit } from '@/util/tasks';

async function main(): Promise<void> {
  try {
    const labDataPath = path.join(process.cwd(), '..', 'resources', 'lab-data');

    const verificationFile = (await readFile(path.join(labDataPath, 'verify.txt')))
      .toString()
      .trim();

    const verificationData = verificationFile.split(/\r?\n/).map((line) => {
      const equalSignIndex = line.indexOf('=');

      return {
        id: line.slice(0, equalSignIndex),
        text: line.slice(equalSignIndex + 1),
      };
    });

    const results = await Promise.all(
      verificationData.map(async ({ id, text }) => {
        const completion = await getChatCompletion({
          model: 'ft:gpt-4o-mini-2024-07-18:personal:lab-data-verification:AZIQqq21',
          context: 'Determine if set of four numbers follows specific pattern.',
          query: text,
        });
        console.log('COMPLETION', id, completion);

        return {
          id,
          isCorrect: completion === 'correct',
        };
      }),
    );

    const result = await submit(
      'research',
      results.filter(({ isCorrect }) => isCorrect).map(({ id }) => id),
    );
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
