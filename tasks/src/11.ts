import path from 'path';
import { readFile, readdir } from 'fs/promises';

import { getChatCompletion } from '@/util/openai';
import { extractJsonArray } from '@/util/formatting';
import { submit } from '@/util/tasks';

async function loadFacts(): Promise<string> {
  const factsPath = path.join(process.cwd(), '..', 'resources', 'pliki-z-fabryki', 'facts');
  const facts = await readdir(factsPath);

  let contents = '';

  await Promise.all(
    facts.map(async (fact) => {
      const content = (await readFile(path.join(factsPath, fact)))
      .toString()
      .replaceAll('\n', '');

      contents += content.length ? `\n${fact}\n- ${content}` : `- ${content}`;
    }),
  );

  return contents;
}

async function loadReports(): Promise<string> {
  const reportsPath = path.join(process.cwd(), '..', 'resources', 'pliki-z-fabryki', 'reports');
  const reports = await readdir(reportsPath);

  let contents = '';

  await Promise.all(
    reports
      .filter((report) => report.endsWith('.txt'))
      .map(async (report) => {
        const content = (await readFile(path.join(reportsPath, report)))
          .toString()
          .replaceAll('\n', '');

        contents += content.length ? `\n${report}\n- ${content}` : `- ${content}`;
      }),
  );

  return contents;
}

async function getContext(facts: string, reports: string): Promise<string> {
  const context = `You will be provided with a user message in Polish language. The message will be one selected report of reports, that are listed below among with list of facts. Your job is to generate a JSON array of tags, that describe given report based on all reports and facts.

<rules>
  - Make the tags descriptive, that fully describe related subjects
  - Always include information about sectors and places if possible
  - NEVER use generic words like "patrol" or "cisza". Focus on characteristics specific to:
    * People and their roles
    * Specific events
    * Exact locations
    * Technologies/tools
    * Programming languages
    * Sectors
    * Unusal events and information about them
    * Information about research on fidings and suspicious activities in sectors
  - Always generate 10 - 20 tags
  - Tags must be in polish language, all lowercase
</rules>

<steps>
  1. First, determine which subjects are meaningful in the raport, that are specific and unorthodox, that I may want to search for later. Such as places, people, events, sectors, findings during patrols. Output your thoughts
  2. After you determined the subjects, find as much information as possible in the context of listed patrol_reports and facts_about_people. Focus on specific things related to these subjects. Output your thoughts and findings about it.
  3. Having the information, that you found, think what is specific to the subjects and might be helpful in finding them later. Output your thoughts
  4. Based on found information, generate set of tags, that is descriptive and exhaustive and fully describes them in detail. Focus on things like technologies, programming languages, places, sectors, etc. Make sure, these words are not against the rules
  5. Output generated tags in a form of JSON array at the very end
</steps>

<patrol_reports>
${reports}
</patrol_reports>

<facts_about_people>
${facts}
</facts_about_people>

<response_format>
**THOUGHTS ON RELEVANT SUBJECTS**
{your thoughts}

**FINDINGS ABOUT RELEVENT SUBJECTS**
{your findings}

**THOUGHTS ABOUT PARTICALLY USEFUL INFORMATION**
{your thoughts}

RESULT: ["tag 1", "tag 2", "tag 3", ...]
</response_format>`;

  return context;
}

async function main(): Promise<void> {
  try {
    const reportsPath = path.join(process.cwd(), '..', 'resources', 'pliki-z-fabryki', 'reports');
    const reports = await readdir(reportsPath);
    const textReports = reports.filter((report) => report.endsWith('.txt'));
    const factsContents = await loadFacts();
    const reportsContents = await loadReports();
    const context = await getContext(factsContents, reportsContents);

    const tags: Record<string, string> = {};

    for (const report of textReports) {
        const reportPath = path.join(reportsPath, report);
        const content = await readFile(reportPath);
        const completion = await getChatCompletion({ query: content.toString(), context, model: 'gpt-4o' });
        if (!completion) {
          throw new Error('Completion not completed.');
        }
        console.log('COMPLETION', completion);

        const extractedTags = extractJsonArray(completion);
        if (!extractedTags || !extractedTags.every((tag) => typeof tag === 'string')) {
          throw new Error('Invalid completion.');
        }

        tags[report] = extractedTags.join(', ');
    }

    console.log('TAGS', tags);

    const result = await submit('dokumenty', tags);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
