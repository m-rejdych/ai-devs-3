import { getChatCompletion } from '@/util/openai';
import { submit } from '@/util/tasks';

interface TestObj {
  question: string;
  answer: number;
  test?: {
    q: string;
    a: string;
  };
}

interface JsonData {
  apikey: string;
  description: string;
  copyright: string;
  ['test-data']: TestObj[];
}

interface Test {
  q: string;
  idx: number;
}

interface AnsweredTest extends Test {
  a: string;
}

const CONTEXT =
  `You will be provided with a JSON array. The array items will have this structure: { q: "question", idx: some number }. Your job is to answer the question stored in "q" for each element in array. Place your answer in the object, that you are working on, in field called "a". Leave the "idx" value as is.

<rules>
- You have to answer "q" with the most concise and direct answer possible
- Never add your own comments, or thoughts, when answering the question
- Skip interpunction and all this kind of characters, when answering the question
- Question "q" must be answererd for each array element
- Your answer must be placed in new field "a", placed in the same object as the question "q"
- You must add field "a" to each object
- You must leave field "idx" untouched
- You must answer with JSON array, that matches the input array, but with included "a" fields, and nothing more
</rules>

<example>
- INPUT: '[{ "q": "What is the capitol of Poland?", "idx": 3 }, { "q": "What is the highest mountain in the world?", "idx": 5 }]'
- OUTPUT: '[{ "q": "What is the capitol of Poland?", "a": "Warsaw", "idx": 3 }, { "q": "What is the highest mountain in the world?", "a": "Mount Everest" "idx": 5 }]'
</example>` as const;

async function main(): Promise<void> {
  try {
    const response = await fetch(
      `https://centrala.ag3nts.org/data/${process.env.AI_DEVS_API_KEY}/json.txt`,
    );
    const { 'test-data': testData, apikey, ...rest } = (await response.json()) as JsonData;

    const collectedTests: Test[] = [];

    testData.forEach((obj, idx) => {
      const [a, b] = obj.question.split(' + ');
      if (!a || !b) {
        throw new Error('Incorrect addition values');
      }

      const parsedA = parseInt(a, 10);
      const parsedB = parseInt(b, 10);
      const result = parsedA + parsedB;

      if (obj.answer !== result) testData[idx]!.answer = result;

      if (obj.test) {
        collectedTests.push({ q: obj.test.q, idx });
      }
    });

    const completion = await getChatCompletion({
      query: JSON.stringify(collectedTests),
      context: CONTEXT,
    });
    if (!completion) {
      throw new Error('Completion unsuccessful');
    }
    console.log('COMPLETION', completion);

    const answeredTests = JSON.parse(completion) as AnsweredTest[];
    answeredTests.forEach(({ idx, ...test }) => {
      testData[idx]!.test = test;
    });

    const result = await submit('JSON', {
      ...rest,
      apikey: process.env.AI_DEVS_API_KEY,
      'test-data': testData,
    });
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
