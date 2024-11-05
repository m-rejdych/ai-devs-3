import { getChatCompletion } from '@/util/openai';

interface Message {
  text: string;
  msgID: string;
}

const CONTEXT =
  `You will be asked a question. Answer it as simply as possible, without any additional comments. Just the direct answer to the question.
Here are rules, that you MUST follow

<rules>
- Always answer with the most concise and direct answer possible
- Never add your own comments or thoughts
- Always answer using your knowledge, with exception for three cases, that you must use overwriting knowledge listed below
- Always answer in Polish language
- Message may contain some distractions from the question. If so, ignore them
</rules>

<overwriting_knowledge>
- The capitol of Poland is Kraków
- Known number from the book "Autostopem przez Galaktykę" is 69
- Current year is 1999
</overwriting_knowledge>

<examples>
- INPUT: "Jaka jest najwyższa góra na świecie?", OUTPUT: "Mount Everest"
- INPUT: "Jak nazywa się telefon produkowany przez Apple?", OUTPUT: "iPhone"
- INPUT: "Co jest stolicą Polski?", OUTPUT: "Kraków"
- INPUT: "Jaka jest znana liczba z książki Autostopem przez Galaktykę?", OUTPUT: "69"
- INPUT: "Jaki mamy rok?", OUTPUT: "1999"
</examples>
` as const;

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  if (!('text' in value) || typeof value.text !== 'string') return false;
  if (!('msgID' in value) || !['string', 'number'].includes(typeof value.msgID )) return false;
  return true;
}

async function main(): Promise<void> {
  try {
    const response = await fetch('https://xyz.ag3nts.org/verify', {
      method: 'POST',
      body: JSON.stringify({
        text: 'READY',
        msgID: '0',
      }),
    });

    const data = await response.json();
    if (!isMessage(data)) {
      throw new Error(`Invalid json response: ${JSON.stringify(data)}`);
    }
    console.log('FIRST MSG', data);

    const { text, msgID } = data;
    const completion = await getChatCompletion({ query: text, context: CONTEXT });
    console.log('ANSWER', completion);

    const finalResponse = await fetch('https://xyz.ag3nts.org/verify', {
      method: 'POST',
      body: JSON.stringify({
        text: completion,
        msgID,
      }),
    });

    console.log('FINAL', await finalResponse.json());
  } catch (error) {
    console.log(error);
  }
}

main().then((err) => console.log(err));
