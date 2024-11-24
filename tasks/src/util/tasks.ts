interface MessageResponse {
  code: number;
  message: string;
}

interface DbResponseData {
  reply: Record<string, unknown>[];
  error: 'OK' | string;
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
): Promise<MessageResponse> {
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

  return response.json() as Promise<MessageResponse>;
}

export async function queryDb(task: string, query: string): Promise<DbResponseData> {
  const response = await fetch(`${process.env.CENTRAL_API_URL}/apidb`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      task,
      apikey: process.env.AI_DEVS_API_KEY,
      query,
    }),
  });

  return response.json() as Promise<DbResponseData>;
}

export async function getPeople(name: string): Promise<MessageResponse> {
  const response = await fetch(`${process.env.CENTRAL_API_URL}/people`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.AI_DEVS_API_KEY,
      query: name,
    }),
  });

  return response.json() as Promise<MessageResponse>;
}

export async function getPlaces(name: string): Promise<MessageResponse> {
  const response = await fetch(`${process.env.CENTRAL_API_URL}/places`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.AI_DEVS_API_KEY,
      query: name,
    }),
  });

  return response.json() as Promise<MessageResponse>;
}
