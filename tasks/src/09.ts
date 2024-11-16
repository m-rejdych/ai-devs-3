import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { createReadStream } from 'fs';

import { openai } from '@/clients/openai';
import { extractExtension, extractXmlTag } from '@/util/formatting';
import { getChatCompletion } from '@/util/openai';
import { submit } from '@/util/tasks';

interface Answer {
  hardware: string[];
  people: string[];
}

const CONTEXT =
  `You will be provided with a report. You job is to determine if the report contains information related to repaired hardware or captured people.
<rules>
  - Focus on key things included in report
  - Determine if the report contains any information about captured people or repaired hardware / machines
  - If the report contains specific information about captured people or repaired hardware / machines, you need to determine, which category it relates to
  - Before your answer, always output your thoughts / reasoning about what is contained in the report. Analyse if there could be any information about captured people or repaired machines.
  - DO NOT categorize unrelevant people or technology that is not directly related to reapairing machine / hardware / robots (such as AI modules, systems, algorithms)
  - DO NOT categorize reports, that mention unrelevant, random, not impornant people
  - DO NOT categorize reports, that mention updated / improvements to hardware. Repairing / fixes only
  - Your final response should be just the category, you assigned the report to, or "null", if it does not include information we look for
</rules>

<allowed_categories>
- hardware - if the report contains infrmation on repaired machines / hardware. This must be directly about repairing or fixing hardware / machines / robots only, not the software or other components such as AI, systems, or algorithms
- people - if the report mentions specific, captured or kidnapped people and has some about them. This is specifically for reports, that mention captured / kidnapped people, so other people should not be included
- null - if the report does not contain any information about repaired hardware or captured people
</allowed_categories>

<final_response_format>
<final_answer>
{category}
</final_answer>
</final_response_format>
` as string;

function isValidSubject(value: unknown): value is keyof Answer {
  return typeof value === 'string' && ['hardware', 'people'].includes(value);
}

async function main(): Promise<void> {
  try {
    const reportsPath = path.join(process.cwd(), '..', 'resources', 'pliki-z-fabryki', 'reports');
    const reports = await readdir(reportsPath);

    const answer: Answer = {
      hardware: [],
      people: [],
    };

    await Promise.all(
      reports.map(async (report) => {
        const reportPath = path.join(reportsPath, report);
        const reportContent = await readFile(reportPath);

        const ext = extractExtension(report);

        switch (ext) {
          case 'txt': {
            const completion = await getChatCompletion({
              query: reportContent.toString(),
              context: CONTEXT,
            });
            if (!completion) break;
            console.log(`--- ${report} ---`, completion);

            const subject = extractXmlTag(completion, 'final_answer');
            if (!isValidSubject(subject)) break;

            answer[subject].push(report);
            break;
          }
          case 'png': {
            const completion = await getChatCompletion({
              context: CONTEXT,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:image/png;base64,${reportContent.toString('base64')}`,
                      },
                    },
                  ],
                },
              ],
            });
            if (!completion) break;
            console.log(`--- ${report} ---`, completion);

            const subject = extractXmlTag(completion, 'final_answer');
            if (!isValidSubject(subject)) break;

            answer[subject].push(report);
            break;
          }
          case 'mp3': {
            const { text } = await openai.audio.transcriptions.create({
              model: 'whisper-1',
              language: 'pl',
              file: createReadStream(reportPath),
            });
            const completion = await getChatCompletion({ context: CONTEXT, query: text });
            if (!completion) break;
            console.log(`--- ${report} ---`, completion);

            const subject = extractXmlTag(completion, 'final_answer');
            if (!isValidSubject(subject)) break;

            answer[subject].push(report);
            break;
          }
          default:
            break;
        }
      }),
    );

    answer.hardware.sort((a, b) => a.localeCompare(b));
    answer.people.sort((a, b) => a.localeCompare(b));

    const result = await submit('kategorie', answer);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
