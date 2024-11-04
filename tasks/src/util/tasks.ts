interface SubmitResponseData {
  code: number;
  message: string;
}

export async function submit(task: string, answer: unknown): Promise<SubmitResponseData> {
  const response = await fetch(process.env.SUBMIT_URL as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.AI_DEVS_API_KEY,
      task,
      answer,
    }),
  });

  return response.json() as Promise<SubmitResponseData>;
}
