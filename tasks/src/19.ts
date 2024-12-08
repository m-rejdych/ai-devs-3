import { submit } from '@/util/tasks';

async function main(): Promise<void> {
  try {
    const result = await submit('webhook', `${process.env.SERVER_PUBLIC_URL}/drones`);
    console.log('RESULT', result);
  } catch (error: any) {
    console.log(error);
  }
}

main();
