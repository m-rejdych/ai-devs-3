import { submit } from './util';

async function main(): Promise<void> {
  try {
    const response = await fetch('https://poligon.aidevs.pl/dane.txt');
    const text = await response.text();

    const lines = text.split(/\r?\n/);
    const result = await submit('POLIGON', lines.filter(Boolean));

    console.log(result);
  } catch (error) {
    console.log(error);
  }
}

main().catch((err) => console.log(err));
