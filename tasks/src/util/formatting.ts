interface ResultObj {
  result: unknown;
}

export function isResultObj(val: unknown): val is ResultObj {
  return typeof val === 'object' && val !== null && 'result' in val;
}

export function extractJsonObj(str: string): Record<string, unknown> | null {
  const startOfJsonIndex = str.indexOf('{');
  if (!startOfJsonIndex) return null;

  const endOfJsonIndex = str.lastIndexOf('}');
  if (!endOfJsonIndex) return null;

  const parsedJson = JSON.parse(str.slice(startOfJsonIndex, endOfJsonIndex + 1));

  return parsedJson;
}
