import path from 'path';
import { writeFile, readFile, rm } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import * as cheerio from 'cheerio';

import { openai } from '@/clients/openai';
import { getChatCompletion } from '@/util/openai';
import { extractXmlTag, extractJsonObj } from '@/util/formatting';
import { submit } from '@/util/tasks';

interface Source {
  url: string;
}

interface Image extends Source {
  caption: string;
}

interface SectionData {
  text: string;
  images: Image[];
  audio: Source[];
}

function getTextContext(title: string, currentSummary: string, questions: string[]): string {
  return `User's message will be a section from an article in Polish language. Your job is to extract all key points, that might be useful for answering questions, that will be provided below. Moreover, you will be provided with section title and current summary, which is a summary from previous sections of the article. Use it as a context, to better understand the section.
<rules>
  - Use Polish language
  - Determine key information, that might be useful for answering provided questions
  - Pay attention to provided current summary, and consider it's context, when generating summary for provided secion. Always try to find meaningful information to answer questions first.
  - Always output your brief reasoning about the section and how it relates to the questions first
  - NEVER make points about lack of information as part of summary
  - If there is no useful information in whole source, just output empty string as your summary
  - Current summary might be empty
  - Your final answer should be a bullet point list
</rules>

<questions>
- ${questions.join('\n- ')}
</questions>

<current_summary>
${currentSummary}
</current_summary>

<title>
${title}
</title>

<final_answer_format>
<final_answer>
{generated summary}
</final_answer>
</final_answer_format>
`;
}

function getImageContext(caption: string, currentSummary: string, questions: string[]): string {
  return `User's message will be an image. The image is part of some article, that we're creating a summary about. Your job is to analyse the image and create a list of key points (summary) about what it represents. Focus on the information, that might be useful to answer the questions, that will also be provided. Below, you will be provided with a caption and current summary of the article. Use this as a context to better understand the image.
<rules>
  - Use Polish language
  - Determine key information, that might be useful for answering provided questions
  - Pay attention to provided current summary, and consider it's context, when generating summary for provided image. Always try to find meaningful information to answer questions first.
  - Use provided caption, to better understand the image
  - Describe the image with details, focus on what place it could be, what city, what is happening on the image etc.
  - Make sure you output some possible city, that image could be taken in based on what is on the image and based on current summary
  - Always output your brief reasoning about the image and how it relates to the questions first
  - NEVER make points about lack of information as part of summary
  - If there is no useful information in whole source, just output empty string as your summary
  - Your final answer should be a bullet point list
</rules>

<questions>
- ${questions.join('\n- ')}
</questions>

<caption>
${caption}
</caption>

<current_summary>
${currentSummary}
</current_summary>

<final_answer_format>
<final_answer>
{generated summary}
</final_answer>
</final_answer_format>
`;
}

function getAudioContext(currentSummary: string, questions: string[]): string {
  return `User's message will be an audio transcription. The audio is part of some article, that we're creating a summary about. Your job is to analyse the transcription and create a list of key points (summary) about what it is about. Focus on the information, that might be useful to answer the questions, that will also be provided. Below, you will be provided with current summary of the article. Use this as a context to better understand the audio.
<rules>
  - Use Polish language
  - Determine key information, that might be useful for answering provided questions
  - Pay attention to provided current summary, and consider it's context, when generating summary for provided audio transcription. Always try to find meaningful information to answer questions first.
  - Always output your brief reasoning about transcription and how it relates to the questions first
  - NEVER make points about lack of information as part of summary
  - If there is no useful information in whole source, just output empty string as your summary
  - Your final answer should be a bullet point list
</rules>

<questions>
- ${questions.join('\n- ')}
</questions>

<current_summary>
${currentSummary}
</current_summary>

<final_answer_format>
<final_answer>
{generated summary}
</final_answer>
</final_answer_format>
`;
}

function getAnswerContext(summary: string): string {
  return `Below, you will find summary of some article. Use this summary as a context to answer questions provided by the user. Questions will be provided as a JSON object with key (id) - value (quesion) pairs.
<rules>
  - Use summary to answer the questions
  - Answer the questions in the as concise way as possible, one sentence max, without any additional comments
  - Not all answers have to be directly included in summary. If it is the case, use your knowledge summary, and other answers, to predict the most probable answer to the question.
  - Respond with JSON where
    - key is the id of the question
    - value is the answer to the corresponding question
  - NEVER add any additional comments
  - Respond with JSON and nothing more
</rules>

<summary>
${summary}
</summary>
`;
}

function parseQuestions(questions: string): Record<string, string> {
  const lines = questions.split(/\r?\n/);
  return lines.reduce<Record<string, string>>((acc, line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return acc;

    const [id, question] = line.split('=') as [string, string];
    acc[id] = question;

    return acc;
  }, {});
}

const parseSection =
  ($: cheerio.Root, currentTitle: string, sections: Record<string, SectionData>) =>
  (_: number, el: cheerio.Element) => {
    const currentEl = $(el);

    if (currentEl.is('h1, h2, h3, h4, h5, h6')) {
      const title = currentEl.text();
      currentTitle = title;
      sections[title] = { text: '', images: [], audio: [] };
      return;
    }

    const currentSection = sections[currentTitle];
    if (!currentSection) return;

    if (currentEl.is('div')) {
      currentEl.children().each(parseSection($, currentTitle, sections));
    } else if (currentEl.is('figure')) {
      const img = currentEl.find('img');
      const caption = currentEl.find('figcaption');
      if (!img) return;

      const src = img.attr('src');
      if (!src) return;

      const url = `${process.env.CENTRAL_API_URL}/dane/${src}`;
      currentSection.images.push({ url, caption: caption.text() });
    } else if (currentEl.is('audio')) {
      const source = currentEl.find('source');
      if (!source) return;

      const src = source.attr('src');
      const url = `${process.env.CENTRAL_API_URL}/dane/${src}`;
      currentSection.audio.push({ url });
    } else {
      currentSection.text += `${currentSection.text ? '\n' : ''}${currentEl.text()}`;
    }
  };

async function main(): Promise<void> {
  try {
    const questionsResponse = await fetch(
      `${process.env.CENTRAL_API_URL}/data/${process.env.AI_DEVS_API_KEY}/arxiv.txt`,
    );
    const questions = parseQuestions(await questionsResponse.text());
    const questionValues = Object.values(questions);
    console.log('QUESTIONS', questions);

    const articleResponse = await fetch(`${process.env.CENTRAL_API_URL}/dane/arxiv-draft.html`);
    const html = await articleResponse.text();
    await writeFile(path.join('..', 'resources', 'arxiv-draft.html'), html);

    const $ = cheerio.load(html);

    const sections: Record<string, SectionData> = {};
    let currentTitle = '';
    let summary = '';

    if (existsSync(path.join('..', 'resources', 'arxiv-summary.txt'))) {
      summary = (await readFile(path.join('..', 'resources', 'arxiv-summary.txt'))).toString();
    } else {
    $('div.container')
      .children()
      .each(parseSection($, currentTitle, sections));

    await writeFile(
      path.join('..', 'resources', 'arxiv-draft-parsed.json'),
      JSON.stringify(sections),
    );

    for (const [title, { text, images, audio }] of Object.entries(sections)) {
        const textCompletion = await getChatCompletion({
          context: getTextContext(title, summary, questionValues),
          query: text,
        });
        if (textCompletion) {
          const extractedSummary = extractXmlTag(textCompletion, 'final_answer');
          if (extractedSummary) summary += `\n\n${title}\n${extractedSummary}`;
        }

        for (const { url, caption } of images) {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const base64Img = Buffer.from(arrayBuffer).toString('base64');

            const imageCompletion = await getChatCompletion({
              context: getImageContext(caption, summary, questionValues),
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${response.headers.get('content-type')};base64,${base64Img}`,
                      },
                    },
                  ],
                },
              ],
            });
            if (imageCompletion) {
              const extractedSummary = extractXmlTag(imageCompletion, 'final_answer');
              if (extractedSummary) summary += `\n${extractedSummary}`;
            }
        }

        for (const { url } of audio) {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const tempFilePath = path.join(process.cwd(), 'temp-audio.mp3');

            await writeFile(tempFilePath, buffer);

            const { text } = await openai.audio.transcriptions.create({
              model: 'whisper-1',
              language: 'pl',
              file: createReadStream(tempFilePath),
            });

            await rm(tempFilePath);

            const audioCompletion = await getChatCompletion({
              context: getAudioContext(summary, questionValues),
              query: text,
            });
            if (audioCompletion) {
              const extractedSummary = extractXmlTag(audioCompletion, 'final_answer');
              if (extractedSummary) summary += `\n${extractedSummary}`;
            }
        }

        console.log('CURRENT SUMMARY', summary);

    }
    }

    console.log('FULL SUMMARY', summary);
    await writeFile(path.join('..', 'resources', 'arxiv-summary.txt'), summary);

    const completion = await getChatCompletion({
      context: getAnswerContext(summary),
      query: JSON.stringify(questions),
    });
    if (!completion) {
      throw new Error('Completion not completed.');
    }

    const json = extractJsonObj(completion);
    console.log('ANSWERS', json);

    const result = await submit('arxiv', json);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
