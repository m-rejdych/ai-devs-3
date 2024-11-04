import path from 'path';
import { config } from 'dotenv';

config();

function main() {
  try {
    const filename = process.argv[2];
    if (!filename) {
      throw new Error('filename arg is required.');
    }

    require(path.join(__dirname, `${filename}.ts`));
  } catch (error) {
    console.log(error);
  }
}

main();
