import path from 'path';
import { readdir, readFile } from 'fs/promises';
import { randomUUID } from 'crypto';

import { qdrant } from '@/clients/qdrant';
import { createEmbedding } from '@/util/openai';
import { submit } from '@/util/tasks';

const COLLECTION_NAME = 'ai-devs-3-weapons' as const;

async function main(): Promise<void> {
  try {
    const weaponsPath = path.join(
      process.cwd(),
      '..',
      'resources',
      'pliki-z-fabryki',
      'weapons',
      'do-not-share',
    );

    const { exists } = await qdrant.collectionExists(COLLECTION_NAME);
    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: 1536, distance: 'Cosine' },
      });

      const weaponsFiles = await readdir(weaponsPath);

      await Promise.all(
        weaponsFiles.map(async (weaponFile) => {
          const weaponPath = path.join(weaponsPath, weaponFile);
          const content = (await readFile(weaponPath)).toString();
          const [year, month, day] = weaponFile.replace('.txt', '').split('_');

          const id = randomUUID();
          const embedding = await createEmbedding(content);
          if (!embedding) throw new Error('Invalid embedding');

          await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: [
              {
                id,
                vector: embedding,
                payload: { createDate: `${year}-${month}-${day}` },
              },
            ],
          });
        }),
      );
    }

    const questionEmbedding = await createEmbedding(
      'W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?',
    );
    const searchResult = await qdrant.query(COLLECTION_NAME, {
      query: questionEmbedding,
      limit: 1,
      with_payload: true,
    });

    const [point] = searchResult.points;

    if (!point?.payload?.createDate) {
      throw new Error('"createDate" payload not found.');
    }

    const result = await submit('wektory', point.payload.createDate);
    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

main();
