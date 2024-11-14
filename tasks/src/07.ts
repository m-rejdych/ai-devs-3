import { readdir, readFile } from 'fs/promises';
import path from 'path';

import { getChatCompletion } from '@/util/openai';

const CONTEXT =
  `Your job is to detect the name of the Polish city presented on provided images. Hint is that in this city were some granaries and fortresses. Gather all useful information such as street names and characteristc points. One image is invalid and represents different city - ignore it. Respond with just the city name and nothing more.` as string;

async function main(): Promise<void> {
  try {
    const mapChunksPath = path.join(process.cwd(), '..', 'resources', 'maps', 'chunks');

    const images = await readdir(mapChunksPath);

    const imagesBase64Urls = await Promise.all(
      images.map(async (image) => {
        const imageFile = await readFile(path.join(mapChunksPath, image));
        const imageFileBase64 = imageFile.toString('base64');
        return `data:image/jpeg;base64,${imageFileBase64}`;
      }),
    );

    const completion = await getChatCompletion({
      context: CONTEXT,
      messages: [
        {
          role: 'user',
          content: imagesBase64Urls.map((url) => ({ type: 'image_url', image_url: { url } })),
        },
      ],
      model: 'gpt-4o',
    });

    console.log(completion);
  } catch (error) {
    console.log(error);
  }
}

main();
