// @ts-nocheck
import path from 'path';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import pdf from 'pdf-parse';
import { fromPath } from 'pdf2pic';

import { getChatCompletion, getImagesCompletion } from '@/util/openai';
import { extractJsonObj } from '@/util/formatting';
import { submit } from '@/util/tasks';

interface ResultObj {
  result: string | null;
}

function isResultObj(value: unknown): value is ResultObj {
  if (typeof value !== 'object' || value === null) return false;
  if (!('result' in value)) return false;
  if (typeof value.result !== 'string' && value.result !== null) return false;
  return true;
}

async function parsePdf(pdfBuffer: Buffer): Promise<pdf.Result> {
  return new Promise((resolve, reject) => {
    pdf(pdfBuffer)
      .then((data) => resolve(data))
      .catch((err) => reject(err));
  });
}

function getContext(notebookChunk: string, prevNotebookChunks: string): string {
  return `User's message will be a question about the notebook. It is a notebook of Rafal - a fictional character from a story about AI and robots. Below, you will be provided with a chunk of the notebook. Your job is to determine if user's question can be answered with your knowledge and knowledge from notebook chunk. If so, answer it, if not, return null in final JSON.

<rules>
  - First, analyse the notebook current chunk content and output your thoughts and reasoning about any information, that might be useful.
  - You will also find notebook_previous_chunk_contents, use it as helper, but focus on notebook_current_chunk_content
  - The notebook is scratched, so some information might not be clear and blurred with ex. "...". Do not treat this as a concrete information, use just as a hint.
  - Take your time and analyse the note content very carefully and in detail. Output all of your thoughts.
  - Pay special attention to events, facts, occurancess. Especially things like LLM models announcments and releases (ex. GPT), etc., that are mentioned in the notebook. These are your main indicators of the time
    - Use your knowledge about these facts and events. Think about them and output, what you know about them - all dates, years, places, etc.
    - Be as exact as possible, when thinking about events, facts, etc. Give exact dates, years, places etc.
    - The answers might not be directly stated in note chunk. So if you can deduct the answer (because you know the year, when some even happened) from given information - use it as answer
    - Try to use your knowledge to answer the question based on the information you have about events, etc. Do not try to find exact answer, if you though of the answer based on your knowledge - use it as answer
    - If you know something like year, or place, based on you knowledge, that might be the answer - DO NOT say that, you don't have enough information - just answer the question with what you have
    - DO NOT try to find exact, direct answer in note - if you can deduct something, that might be the answer, based on you knowledge - ALWAYS USE IT
    - Use this information about events, facts, etc. as your prior indicator of time and place. Treat it as your most reliable information
  - If the question is about a place, describe the place in a sentence. Be specific about what you know about the place. It does not have to be exactly pointed out in text, what is the name of the place. It can be just some characteristics of the place. Try to use Sigla/Siglum
  - NEVER give non direct or unclear answers like (... "lub" ..., "prawdopodobnie", "około", etc.)
  - Output all your thinking and reasoning in <THINKING>...</THINKING> tags
  - After you are done thinking, answer user's question in concise way
  - Use polish language in your answer
  - When answering question, focus not only on provided notebook but also on your knowledge 
  - If you are able to answer based on delivered notebook chnunk, do so, if not, return null as "result" field in final_response_format JSON
  - ALWAYS use final_response_format for your final JSON output
  - YOU MUST end your response with final_response_format JSON without markdown code block
</rules>

<notebook_chunk_content>
${notebookChunk}
</notebook_chunk_content>

<notebook_previous_chunk_contents>
${prevNotebookChunks}
</notebook_previous_chunk_contents>

<final_response_format>
{
  "result": "{answer to question}" | null
}
</final_response_format>
`;
}

function getImageContext(): string {
  return `User's message will be an image and a question about the notebook. The image is a chunk from a notebook of Rafal - a fictional character from a story about AI and robots. Below, you will be provided with a chunk of the notebook. Your job is to determine if user's question can be answered with your knowledge and knowledge from notebook chunk image. If so, answer it, if not, return null in final JSON.

<rules>
  - First, analyse the notebook chunk image and output your thoughts and reasoning about any information, that might be useful.
  - The notebook is scratched, so some information might not be clear and blurred with ex. "...". Do not treat this as a concrete information, use just as a hint.
  - Take your time and analyse the note content very carefully and in detail. Output all of your thoughts.
  - Pay special attention to events, facts, occurancess. Especially things like LLM models announcments and releases (ex. GPT), etc., that are mentioned in the notebook. These are your main indicators of the time
    - Use your knowledge about these facts and events. Think about them and output, what you know about them - all dates, years, places, etc.
    - Be as exact as possible, when thinking about events, facts, etc. Give exact dates, years, places etc.
    - The answers might not be directly stated in note chunk. So if you can deduct the answer (because you know the year, when some even happened) from given information - use it as answer
    - Try to use your knowledge to answer the question based on the information you have about events, etc. Do not try to find exact answer, if you though of the answer based on your knowledge - use it as answer
    - If you know something like year, or place, based on you knowledge, that might be the answer - DO NOT say that, you don't have enough information - just answer the question with what you have
    - DO NOT try to find exact, direct answer in note - if you can deduct something, that might be the answer, based on you knowledge - ALWAYS USE IT
    - Use this information about events, facts, etc. as your prior indicator of time and place. Treat it as your most reliable information
  - If the question is about a place, describe the place in a short sentence. It does not have to be exactly pointed out in text, what is the name of the place. It can be just some characteristics of the place
  - NEVER give non direct or unclear answers like (... "lub" ..., "prawdopodobnie", "około", etc.)
  - Output all your thinking and reasoning in <THINKING>...</THINKING> tags
  - After you are done thinking, answer user's question in concise way
  - Use polish language in your answer
  - When answering question, focus not only on provided notebook but also on your knowledge 
  - If you are able to answer based on delivered notebook chnunk, do so, if not, return null as "result" field in final_response_format JSON
  - ALWAYS use final_response_format for your final JSON output
  - YOU MUST end your response with final_response_format JSON without markdown code block
</rules>

<final_response_format>
{
  "result": "{answer to question}" | null
}
</final_response_format>
`;
}

async function askQuestion(
  question: string,
  resources: string[],
  currentResourceIdx = 0,
  prevNotebookChunks = '',
): Promise<ResultObj> {
  if (currentResourceIdx >= resources.length)
    throw new Error('currentResourceIdx exceeded possible resources indexes.');

  const completion = await getChatCompletion({
    query: question,
    context: getContext(resources[currentResourceIdx]!, prevNotebookChunks),
    model: 'gpt-4o',
  });
  console.log(`COMPLETION for question: ${question}\n`, completion);
  if (!completion) throw new Error(`Completion not completed for question: ${completion}`);

  const json = extractJsonObj(completion);
  if (!isResultObj(json)) throw new Error('Incorrect completion json');

  if (json.result || currentResourceIdx === resources.length - 1) return json;

  prevNotebookChunks += `\n\n${resources[currentResourceIdx]}`;

  return askQuestion(question, resources, currentResourceIdx + 1, prevNotebookChunks);
}

async function askImageQuestion(question: string, file: Buffer): Promise<ResultObj> {
  const completion = await getImagesCompletion(
    [`data:image/png;base64,${file.toString('base64')}`],
    {
      query: question,
      context: getImageContext(),
      model: 'gpt-4o',
    },
  );
  console.log(`IMAGE COMPLETION for question: ${question}\n`, completion);
  if (!completion) throw new Error(`Image completion not completed for question: ${completion}`);

  const json = extractJsonObj(completion);
  if (!isResultObj(json)) throw new Error('Incorrect completion json');

  return json;
}

async function main(): Promise<void> {
  try {
    const response = await fetch(
      `https://centrala.ag3nts.org/data/${process.env.AI_DEVS_API_KEY}/notes.json`,
    );
    const questions = (await response.json()) as Record<string, string>;
    const cachedQuestionsPath = path.join(
      process.cwd(),
      '..',
      'resources',
      'notes-rafala-cache.json',
    );
    let cachedQuestions = await (async () => {
      try {
        const content = await readFile(cachedQuestionsPath);
        const json = JSON.parse(content.toString());
        return json as Record<string, string>;
      } catch {
        return null;
      }
    })();
    console.log('QUESTIONS', questions);

    const pdfPath = path.join(process.cwd(), '..', 'resources', 'Notes\ Rafała.pdf');
    const parsedPdf = await parsePdf(await readFile(pdfPath));
    const parsedPdfText = parsedPdf.text.trim();
    const parsedPdfPath = path.join(process.cwd(), '..', 'resources', 'notes-rafala-parsed.txt');
    const pdfImagesPath = path.join(process.cwd(), '..', 'resources', 'notes-rafala-images');
    if (!existsSync(parsedPdfPath)) {
      await writeFile(parsedPdfPath, parsedPdfText);
    }

    if (!existsSync(pdfImagesPath)) {
      await mkdir(pdfImagesPath);

      const pdfPicConvert = fromPath(pdfPath, {
        savePath: pdfImagesPath,
        density: 300,
        saveFilename: 'page',
        format: 'png',
        width: 1280,
        height: 1280,
      });

      await Promise.all(
        Array.from({ length: parsedPdf.numpages }, async (_, i) => {
          await pdfPicConvert(i + 1);
        }),
      );
    }

    const answers: Record<string, string> = {};

    for (const [id, question] of Object.entries(questions)) {
      if (cachedQuestions && id in cachedQuestions) {
        answers[id] = cachedQuestions[id]!;
        continue;
      }

      let answer: { result: null | string } = { result: null };
      if (!answer.result) {
        const images = (await readdir(pdfImagesPath)).sort((a, b) => {
          const [,aIdx] = a.split('.');
          const [,bIdx] = b.split('.');
          return parseInt(aIdx) > parseInt(bIdx) ? 1 : -1;
        });
        const image = await readFile(path.join(pdfImagesPath, images[images.length - 1]!));
        answer = await askImageQuestion(question, image);
      }
      if (!answer.result) throw new Error(`Not Found answer for question: ${question}`);

      if (cachedQuestions) cachedQuestions[id] = answer.result;
      else cachedQuestions = { [id]: answer.result };

      await writeFile(cachedQuestionsPath, JSON.stringify(cachedQuestions));
      answers[id] = answer.result;
    }

    console.log('ANSWERS', answers);
    const result = await submit('notes', answers);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
