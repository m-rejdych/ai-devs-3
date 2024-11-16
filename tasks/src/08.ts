import { openai } from '@/clients/openai';
import { getChatCompletion } from '@/util/openai';
import { submit } from '@/util/tasks';

interface RobotData {
  description: string;
}

const CONTEXT =
  'You will be provided with a description of some robot. Your job is to focus on all most important points from this description and prepare a prompt for image model, that will create an image of this robot. Use all best practices for prompting image models.' as const;

async function main(): Promise<void> {
  try {
    const response = await fetch(
      `${process.env.CENTRAL_API_URL}/data/${process.env.AI_DEVS_API_KEY}/robotid.json`,
    );
    const { description } = (await response.json()) as RobotData;

    const robotImageDescription = await getChatCompletion({ query: description, context: CONTEXT });
    if (!robotImageDescription) {
      throw new Error('Image description not completed.');
    }

    const image = await openai.images.generate({
      size: '1024x1024',
      model: 'dall-e-3',
      response_format: 'url',
      prompt: robotImageDescription,
    });
    const url = image.data[0]?.url;
    if (!url) {
      throw new Error('Image not completed.');
    }
    console.log('URL', url);

    const result = await submit('robotid', url);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
