import { submit } from '@/util/tasks';

async function main(): Promise<void> {
  try {
    const response = await fetch(`${process.env.POLIGON_API_URL}/dane.txt`);
    const text = await response.text();

    const lines = text.split(/\r?\n/);
    const result = await submit('POLIGON', lines.filter(Boolean), 'poligon');

    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

main();
