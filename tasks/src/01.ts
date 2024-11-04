import * as cheerio from 'cheerio';

import { getChatCompletion } from '@/util/openai';

const URL = 'https://xyz.ag3nts.org/' as const;

async function main(): Promise<void> {
  try {
    const response = await fetch(URL);
    const $ = cheerio.load(await response.text());

    const question = $('p[id="human-question"]').text().replace('Question:', '');

    const completion = await getChatCompletion({
      query: question,
      context:
        "Your only job is to answer user's question with single numeric value. Respond with just numeric value and nothing more",
    });

    console.log('QUESTION', question);
    console.log('ANSWER', completion);

    const formData = new FormData();
    formData.set('username', 'tester');
    formData.set('password', '574e112a');
    formData.set('answer', completion);

    const submitResponse = await fetch(URL, { method: 'POST', body: formData });
    console.log(await submitResponse.text());
  } catch (error) {
    console.log(error);
  }
}

main().catch((err) => console.log(err));
