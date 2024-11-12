interface SubmitResponseData {
  code: number;
  message: string;
}

type Target = 'poligon' | 'central';

function getTargetSubmitUrl(target: Target): string {
  switch (target) {
    case 'poligon':
      return `${process.env.POLIGON_API_URL}/verify`;
    case 'central':
    default:
      return `${process.env.CENTRAL_API_URL}/report`;
  }
}

export async function submit(
  task: string,
  answer: unknown,
  target: 'poligon' | 'central' = 'central',
): Promise<SubmitResponseData> {
  const response = await fetch(getTargetSubmitUrl(target) as string, {
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
