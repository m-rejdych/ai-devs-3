import { submit } from '@/util/tasks';

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done_reason: string;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

const CONTEXT = `You will be provided with short user message in Polish language. Your job is to hide any nevraligc data, such as name, address, age, by replacing it's actual value with word "CENZURA". Don't add any additional comments, return just the censored text with preserved initial structure.

<rules>
- Replace following values with word "CENZURA"
  * First, last name
  * Street name
  * City
  * Age
- Do not modify structure of the message
- Preserve all other words, punctuation, etc.
</rules>

<examples>
- INPUT: "Podejrzany nazywa się Tomasz Kaczmarek. Jest zameldowany w Poznaniu, ul. Konwaliowa 18. Ma 25 lat." | OUTPUT: "Podejrzany nazywa się CENZURA. Jest zameldowany w CENZURA, ul. CENZURA. Ma CENZURA lat."
- INPUT: "Tożsamość osoby podejrzanej: Piotr Lewandowski. Zamieszkały w Łodzi przy ul. Wspólnej 22. Ma 34 lata." | OUTPUT: "Tożsamość osoby podejrzanej: Piotr Lewandowski. Zamieszkały w CENZURA przy ul. CENZURA. Ma CENZURA lata."
</examples>`;

async function main(): Promise<void> {
  try {
    const response = await fetch(
      `${process.env.CENTRAL_API_URL}/data/${process.env.AI_DEVS_API_KEY}/cenzura.txt`,
    );
    const data = await response.text();
    console.log('DATA', data);

    const ollamaRes = await fetch(`${process.env.OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: CONTEXT },
          { role: 'user', content: data },
        ],
      }),
    });

    const result = (await ollamaRes.json() as OllamaResponse).message.content;
    console.log('RESULT', result);

    const submitResponse = await submit('CENZURA', result);
    console.log(submitResponse);
  } catch (error) {
    console.log(error);
  }
}

main();
