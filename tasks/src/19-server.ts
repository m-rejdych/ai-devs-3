import express from 'express';

import { getChatCompletion } from '@/util/openai';
import { extractJsonObj } from '@/util/formatting';

interface ReqBody {
  instruction: string;
}

interface DescriptionObj {
  description: string;
}

interface ErrorObj {
  error: string;
}

type ResBody = DescriptionObj | ErrorObj;

const CONTEXT =
  `We are playing a game. Below, you will find a description of 4x4 map. Each field will be described with points (x, y). The description for each point on map will say, what is present on that specific point. User's message will be a description of his move in natural, Polish language. Your job is to determine, what is user's position after his move and return description for that specific point.
<rules>
  - You can move on 4x4 map
  - Fields are 1 base indexed, so the left most position is 1 on X axis, and the top most position is 1 on Y axis
  - Fields are described as points, where first value is position on X axis, and second value is position on Y axis. Ex. (2, 4) - X = 2, Y = 4
  - The starting point is always (1, 1)
  - User messages will be in Polish language
  - First of all, output your reasoning and thoughts about user's message. Analyse his natural human language in a way, that will allow you to determine a specific point, that is the position after his described move.
  - After you determined a specific point, look up the description for that point and return it in your final answer
  - Your final answer should always be at the end in form of JSON
</rules>

<map_size>
  - Square
  - X axis length: 4
  - Y axis length: 4
</map_size>

<map_field_descriptions>
  - (1, 1) - pozycja startowa
  - (2, 1) - trawa
  - (3, 1) - drzewo
  - (4, 1) - budynek
  - (1, 2) - trawa
  - (2, 2) - wiatrak
  - (3, 2) - trawa
  - (4, 2) - trawa
  - (1, 3) - trawa
  - (2, 3) - trawa
  - (3, 3) - kamień
  - (4, 3) - drzewa
  - (1, 4) - skały
  - (2, 4) - skały
  - (3, 4) - samochód
  - (4, 4) - jaskinia
</map_field_descriptions>

<final_answer>
{
  "point": "{user's position after his move}"
  "description": "{description of the field, that user is positioned after his move}"
}
</final_answer>` as const;

function isCorrectResBody(value: unknown): value is DescriptionObj {
  if (typeof value !== 'object' || value === null) return false;
  if (!('description' in value) || typeof value.description !== 'string') return false;
  return true;
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post<unknown, ResBody, ReqBody>('/drones', async (req, res) => {
  try {
    const { instruction } = req.body;
    console.log('INSTRUCTION', instruction);

    const completion = await getChatCompletion({ query: instruction, context: CONTEXT });
    console.log('COMPLETION', completion);
    if (!completion) throw new Error('Completion not completed');

    const json = extractJsonObj(completion);
    if (!json || !isCorrectResBody(json)) {
      throw new Error('JSON could not be extracted from completion.');
    }

    res.json(json);
  } catch (error: any) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.SERVER_PORT ?? 8080;

app.listen(port, () => console.log(`App is running on http://localhost:${port}`));
