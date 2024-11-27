import path from 'path';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

import { submit } from '@/util/tasks';
import { getChatCompletion, getImagesCompletion } from '@/util/openai';
import { extractJsonObj } from '@/util/formatting';

interface ImagesData {
  baseUrl: string;
  files: { name: string; fullPath: string }[];
}

interface ExtractRepairedPhotosArgs {
  files: ImagesData['files'];
  imagesBaseUrl: string;
  savedPhotos: string[];
  photosPath: string;
  repairedImages: ImagesData['files'];
}

const URLS_CONTEXT =
  `In user's message, you will find a text in Polish language, that informs about image files and base url, where these files are stored. Your only job is is to return JSON with fields:
<fields>
- baseUrl - A base url for files
- files - an array of  objects with keys: "name" (image file name) and "fullPath" (full path to image - baseUrl + image path)
</fields>

<response_example>
{
  "baseUrl": "https://xxx.com/",
  "files": [
    { "name": "filename.png", "fullPath": "https://xxx.com/filename.png" }
  ]
}
</response_example>
` as const;

const TOOL_SELECTION_CONTEXT = `User's message will be an image. Your job is to analyse this image and determie if it needs correction. Your answer should be a name of the tool, that should be used to correct the image. Tools are listed below.
<tools>
  - BRIGHTEN - this tool brightens the image. Use it, if the image is too dark and making it brighter would make it more readable.
  - DARKEN - this tool darkens the image. Use it, if the image is too bright and making it darker would make it more readable.
  - REPAIR - this tool can repair the image, if it has flaws, like blurs, glitches, noises. Use it if you see, that image is unreadable due tue reasons like that.
  - NONE - this means, that there is nothing wrong about the image and no tool should be used.
</tools>

<rules>
  - Always analyse images in context of it's readability
  - Always return a single word response
  - The response should always be one of the tools, or NONE if the tool should not be used
  - ALWAYS Respond with allowed tool name and nothing more
</rules>
`;

const REPAIRED_IMAGE_CONTEXT =
  `User's message will include information about an image file. It may contain the file name itself, or a link to a file. Your job is to extract just the filename and return it. If it is a link, extract just the last segment, which is a filename and return it. Respond with just filename and nothing more.` as const;

const CREATE_PROFILE_CONTEXT =
  `User message will be a set of photos. Your job is to generate a profile description of a woman named "Barbara", based on these photos. We don't know how the woman looks, so you need to look for as much related information on photos as possible, then generate a very detailed profile description.
<rules>
  - Analyse set of photos with intention of gathering as much information about a woman named "Barbara"
  - Not all images have to be relevant - if the image does not provide useful information, skip it
  - Output your thinking and reasoning about the images, before generating a profile description. Be specific, look for even smallest details in her appearance.
  - Profile description should be as detailed as possible, considering all possible information from relevant images.
  - Focus on all characteristic and specific appearance points. If you find them, describe them in great detail. Describe how they look, what they present, where are they placed.
  - Describe every possible detail about her face, hair, head, eyes, nose, chicks, posture, such as EXACT colors, shapes, etc.
  - Profile description must be in Polish language
  - Your final respones should be a JSON with field "result", that will be your generated profile description
</rules>

<final_response_format>
{
  "result": "generated profile description"
}
</final_response_format>
` as const;

function isImagesData(val: unknown): val is ImagesData {
  if (typeof val !== 'object') return false;
  if (val === null) return false;
  if (!('baseUrl' in val) || typeof val.baseUrl !== 'string') return false;
  if (!('files' in val) || !Array.isArray(val.files)) return false;
  if (
    !val.files.every((file) => {
      if (typeof file !== 'object') return false;
      if (file === null) return false;
      if (!('name' in file) || typeof file.name !== 'string') return false;
      if (!('fullPath' in file) || typeof file.fullPath !== 'string') return false;
      return true;
    })
  )
    return false;

  return true;
}

async function extractRepairedPhotos({
  files,
  imagesBaseUrl,
  savedPhotos,
  photosPath,
  repairedImages,
}: ExtractRepairedPhotosArgs): Promise<void> {
  const selectedTools = await Promise.all(
    files.map(async ({ name, fullPath }) => {
      const imageResponse = await fetch(fullPath);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());

      if (!savedPhotos.includes(name)) {
        await writeFile(path.join(photosPath, name), buffer);
      }

      const toolCompletion = await getImagesCompletion(
        [`data:${imageResponse.headers.get('content-type')};base64,${buffer.toString('base64')}`],
        { context: TOOL_SELECTION_CONTEXT, model: 'gpt-4o' },
      );
      console.log(`${name} - ${toolCompletion}`);
      if (!toolCompletion) throw new Error('Tool completion not completed.');

      return { name, fullPath, tool: toolCompletion };
    }),
  );
  console.log('SELECTED TOOLS', selectedTools);

  const repairedImagesData = await Promise.all(
    selectedTools.map(async ({ name, fullPath, tool }) => {
      if (tool === 'NONE') return { name, fullPath, repairingConfirmed: true };

      const repairedImageMessage = (await submit('photos', `${tool} ${name}`)).message;
      console.log('REPAIRED MESSAGE', repairedImageMessage);

      const repairedImageCompletion = await getChatCompletion({
        context: REPAIRED_IMAGE_CONTEXT,
        query: repairedImageMessage,
      });
      if (!repairedImageCompletion) throw new Error('Repaired image completion not completed.');
      console.log('REPAIRED COMPLETION', name, repairedImageCompletion);

      return {
        name: repairedImageCompletion,
        fullPath: `${imagesBaseUrl}${repairedImageCompletion}`,
        repairingConfirmed: false,
      };
    }),
  );
  console.log('REPAIRED IMAGES', repairedImagesData);

  const confirmedRepairedImages = repairedImagesData.filter(
    ({ repairingConfirmed }) => repairingConfirmed,
  );
  const notConfirmedRepairedImages = repairedImagesData.filter(
    ({ repairingConfirmed }) => !repairingConfirmed,
  );

  confirmedRepairedImages.forEach(({ name, fullPath }) => {
    repairedImages.push({ name, fullPath });
  });
  console.log('CURRENT REPAIRED IMAGES', repairedImages);
  console.log('IMAGES TO REPAIR', notConfirmedRepairedImages);

  if (notConfirmedRepairedImages.length) {
    await extractRepairedPhotos({
      files: notConfirmedRepairedImages,
      repairedImages,
      photosPath,
      savedPhotos,
      imagesBaseUrl,
    });
  }
}

async function main(): Promise<void> {
  try {
    const startMessage = (await submit('photos', 'START')).message;
    console.log('START', startMessage);

    const urlsCompletion = await getChatCompletion({ context: URLS_CONTEXT, query: startMessage });
    if (!urlsCompletion) throw new Error('Invalid urls extraction completion.');

    const imagesData = extractJsonObj(urlsCompletion);
    console.log('IMAGES DATA', imagesData);
    if (!isImagesData(imagesData)) throw new Error('URLs not generated.');

    const photosPath = path.join(process.cwd(), '..', 'resources', 'barbara-photos');
    const savedPhotos = await (async () => {
      try {
        const photos = await readdir(photosPath);
        return photos;
      } catch {
        return [];
      }
    })();

    if (!existsSync(photosPath)) await mkdir(photosPath);

    const repairedImagesData: ImagesData['files'] = [];

    await extractRepairedPhotos({
      files: imagesData.files,
      imagesBaseUrl: imagesData.baseUrl,
      savedPhotos,
      photosPath,
      repairedImages: repairedImagesData,
    });

    const repairedPhotosPath = path.join(
      process.cwd(),
      '..',
      'resources',
      'barbara-photos-repaired',
    );
    const repairedPhotos = await (async () => {
      try {
        const repaired = await readdir(repairedPhotosPath);
        return repaired;
      } catch {
        return [];
      }
    })();

    if (!existsSync(repairedPhotosPath)) await mkdir(repairedPhotosPath);

    const base64Urls = await Promise.all(
      repairedImagesData.map(async ({ fullPath, name }) => {
        const imageResponse = await fetch(fullPath);
        const buffer = Buffer.from(await imageResponse.arrayBuffer());

        if (!repairedPhotos.includes(name)) {
          await writeFile(path.join(repairedPhotosPath, name), buffer);
        }

        return `data:${imageResponse.headers.get('content-type')};base64,${buffer.toString('base64')}`;
      }),
    );

    const profileCompletion = await getImagesCompletion(base64Urls, {
      context: CREATE_PROFILE_CONTEXT,
    });
    console.log('PROFILE COMPLETION', profileCompletion);
    if (!profileCompletion) throw new Error('Profile completion not completed');

    const profileDescription = extractJsonObj(profileCompletion);
    if (!profileDescription) throw new Error('Profile description could not be extracted.');

    console.log('PROFILE DESCRIPTION', profileDescription.result);
    const result = await submit('photos', profileDescription.result);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
