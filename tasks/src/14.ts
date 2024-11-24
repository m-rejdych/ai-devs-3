import path from 'path';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

import { getPeople, getPlaces, submit } from '@/util/tasks';
import { getChatCompletion } from '@/util/openai';

const LIMIT = 40 as const;

async function getPersonData(
  name: string,
  logFilePath: string,
  counter: number,
  currentData: Record<string, string>,
): Promise<void> {
  if (counter >= LIMIT) {
    log(logFilePath, 'LIMIT EXCEEDED');
    return;
  }

  if (name in currentData) {
    log(logFilePath, `${name} DATA ALREADY FETCHED`);
    return;
  }

  const { message } = await getPeople(name);
  currentData[name] = message;
  counter++;

  log(logFilePath, [`Fetching info about ${name}...`, `${name} - ${message}`]);

  if (/^([A-Z]+ ?)+$/.test(message)) {
    const cities = message.split(' ');
    for (const city of cities) {
      await getCityData(city, logFilePath, counter, currentData);
    }
  }
}

async function getCityData(
  name: string,
  logFilePath: string,
  counter: number,
  currentData: Record<string, string>,
): Promise<void> {
  if (counter >= LIMIT) {
    console.log('LIMIT EXCEEDED');
    return;
  }

  if (name in currentData) {
    log(logFilePath, `${name} DATA ALREADY FETCHED`);
    return;
  }

  const { message } = await getPlaces(name);
  currentData[name] = message;
  counter++;

  log(logFilePath, [`Fetching info about ${name}...`, `${name} - ${message}`]);

  if (/^([A-Z]+ ?)+$/.test(message)) {
    const people = message.split(' ');
    for (const person of people) {
      await getPersonData(person, logFilePath, counter, currentData);
    }
  }
}

async function log(filePath: string, messages: string | string[]): Promise<void> {
  let currentContent = await (async () => {
    try {
      const content = await readFile(filePath);
      return content.toString();
    } catch {
      return '';
    }
  })();

  if (!currentContent) {
    currentContent += '\n';
  }

  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      console.log(message);
      currentContent += `${currentContent && '\n'}${message}`;
    });
  } else {
    console.log(messages);
    currentContent += `${currentContent && '\n'}${messages}`;
  }

  await writeFile(filePath, currentContent);
}

async function main(): Promise<void> {
  try {
    const logsPath = path.join(process.cwd(), '..', 'resources', 'barbara-search');
    let counter = 0;
    const currentData: Record<string, string> = {};

    if (!existsSync(logsPath)) {
      await mkdir(logsPath, { recursive: true });
    }

    await getPersonData('barbara', path.join(logsPath, 'barbara.txt'), counter, currentData);
    await getPersonData('andrzej', path.join(logsPath, 'andrzej.txt'), counter, currentData);
    await getPersonData('aleksander', path.join(logsPath, 'aleksander.txt'), counter, currentData);
    await getPersonData('aleksander', path.join(logsPath, 'rafal.txt'), counter, currentData);

    await getCityData('krakow', path.join(logsPath, 'krakow.txt'), counter, currentData);
    await getCityData('warszawa', path.join(logsPath, 'warszawa.txt'), counter, currentData);

    log(path.join(logsPath, 'result.json'), JSON.stringify(currentData));

    const completion = await getChatCompletion({
      context:
        "Based on user's JSON, that represents merged city to person and person to city map, return the city that is associated with BARBARA the most. Return the city as string and nothing more.",
      query: JSON.stringify(currentData),
    });
    console.log('COMPLETION', completion);

    const result = await submit('loop', completion);
    console.log('RESULT', result);
  } catch (error) {
    console.log(error);
  }
}

main();
