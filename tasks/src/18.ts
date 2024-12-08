import path from 'path';
import * as cheerio from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { NodeHtmlMarkdown } from 'node-html-markdown';

import { getChatCompletion } from '@/util/openai';
import { extractJsonObj } from '@/util/formatting';
import { submit } from '@/util/tasks';

interface Link {
  title: string;
  url: string;
}

interface ProcessedPage {
  answer: string | null;
  nextPage: string | null;
}

const BASE_URL = 'https://softo.ag3nts.org' as const;
const BANNED_URLS = ['/cennik', '/loop'];
const REQUEST_RATE_LIMIT = 5 as const;

const getProcessPageContext = (
  question: string,
): string => `You will be provided with web page context, which is parsed to markdown format. Your main goal is to answer the question, that is specified below. If current page content provides enough information, answer the question. If it doesn't, decide, which of liked pages should be checked for the answer next and return it's url.
<rules>
  - Analyse the page content and output your thinking and reasoning about the page in context of the question.
  - After your reasoning, return final answer in form of JSON
  - ALWAYS return JSON at the end with either answer to the question, or a link to the next page, that should be analysed and which is the most probable to have the answer inside
  - If you can't answer the question and you can't find any link with potential answer inside, return JSON with just null values
  - The answer should be concise and shouldn't include any additional comments.
</rules>

<final_answer_format>
{
  "answer": null | "{answer to the question}"
  "nextPage": null | "{link the next page, that should be analysed}"
}
</final_answer_format>

<question>
${question}
</question>

<example_outputs>
  - { "answer": "This is the answer to the question", "nextPage": null }
  - { "answer": null, "nextPage": "/some-page" }
  - { "answer": null, "nextPage": null }
</example_outputs>`;

function isProcessedPage(val: unknown): val is ProcessedPage {
  if (typeof val !== 'object' || val === null) return false;
  if (!('answer' in val) || !('nextPage' in val)) return false;
  if (typeof val.answer !== 'string' && val.answer !== null) return false;
  if (typeof val.nextPage !== 'string' && val.nextPage !== null) return false;
  return true;
}

async function analysePage(url: string, visitedUrls: string[], title?: string): Promise<void> {
  const softoSiteDataPath = path.join(process.cwd(), '..', 'resources', 'softo-site-data');
  const html = await (await fetch(url)).text();
  const links: Link[] = [];
  const $ = cheerio.load(html);

  $('*')
    .contents()
    .each((_, el) => {
      const selectedEl = $(el);
      if (selectedEl.hasClass('hidden') || selectedEl.attr('hidden') || el.type === 'comment') {
        selectedEl.remove();
      }
    });

  $('body a').each((_, el) => {
    const selectedEl = $(el);
    const href = selectedEl.attr('href');
    if (
      !href ||
      BANNED_URLS.some((bannedUrl) => href.includes(bannedUrl)) ||
      (href.startsWith('https') && !href.includes(BASE_URL))
    )
      return;
    links.push({
      title: selectedEl.text().trim(),
      url: href.startsWith('https') ? href : `${BASE_URL}${href}`,
    });
  });

  const markdown = NodeHtmlMarkdown.translate($.html());
  await writeFile(
    path.join(
      softoSiteDataPath,
      `${title ? title.toLowerCase().replaceAll(' ', '-') : 'main-page'}.md`,
    ),
    `SOURCE: ${url}\n\n${markdown}`,
  );

  visitedUrls.push(url);

  for (const { url, title } of links.filter(({ url }) => !visitedUrls.includes(url))) {
    await analysePage(url, visitedUrls, title);
  }
}

async function processPage(
  url: string,
  question: string,
  processedPages: Record<string, string>,
  alreadyVisited: string[],
  requestCount: number,
): Promise<string> {
  if (++requestCount > REQUEST_RATE_LIMIT) throw new Error('Request limit exceeded.');
  if (alreadyVisited.includes(url)) throw new Error('You entered a loop.');

  let pageContent: string;
  if (url in processedPages) pageContent = processedPages[url]!;
  else {
    const html = await (await fetch(url)).text();
    const markdown = NodeHtmlMarkdown.translate(html);

    processedPages[url] = markdown;
    pageContent = markdown;
  }

  alreadyVisited.push(url);

  const completion = await getChatCompletion({
    query: pageContent,
    context: getProcessPageContext(question),
  });
  console.log('PORCESS PAGE COMPLETION', completion);
  if (!completion) throw new Error('Completion not completed.');

  const json = extractJsonObj(completion);
  if (!json || !isProcessedPage(json)) throw new Error('Invalid json completion.');

  const { answer, nextPage } = json;

  if (answer) return answer;
  if (!nextPage) throw new Error('Answer not found.');

  const nextUrl = (() => {
    if (nextPage.startsWith(BASE_URL)) return nextPage;
    if (nextPage.startsWith('/')) return `${BASE_URL}${nextPage}`;
    return null;
  })();
  if (!nextUrl) throw new Error('Answer not found.');

  return processPage(nextUrl, question, processedPages, alreadyVisited, requestCount);
}

async function main(): Promise<void> {
  try {
    const response = await fetch(
      `${process.env.CENTRAL_API_URL}/data/${process.env.AI_DEVS_API_KEY}/softo.json`,
    );
    const questions = (await response.json()) as Record<string, string>;
    console.log('QUESTIONS', questions);

    const softoSiteDataPath = path.join(process.cwd(), '..', 'resources', 'softo-site-data');
    if (!existsSync(softoSiteDataPath)) await mkdir(softoSiteDataPath);
    analysePage(BASE_URL, [], 'main-page.md');

    const processedPages: Record<string, string> = {};
    const answers: Record<string, string> = {};

    for (const [id, question] of Object.entries(questions)) {
      answers[id] = await processPage(BASE_URL, question, processedPages, [], 0);
    }

    console.log('ANSWERS', answers);

    const result = await submit('softo', answers);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
