interface ResultObj {
  result: unknown;
}

export function isResultObj(val: unknown): val is ResultObj {
  return typeof val === 'object' && val !== null && 'result' in val;
}

export function extractJsonObj(str: string): Record<string, unknown> | null {
  const startOfJsonIndex = str.indexOf('{');
  if (startOfJsonIndex === -1) return null;

  const endOfJsonIndex = str.lastIndexOf('}');
  if (endOfJsonIndex === -1) return null;

  return JSON.parse(str.slice(startOfJsonIndex, endOfJsonIndex + 1));
}

export function extractJsonArray(str: string): unknown[] | null {
  const startOfArrayIdx = str.indexOf('[');
  if (startOfArrayIdx === -1) return null;

  const endOfArrayIdx = str.lastIndexOf(']');
  if (endOfArrayIdx === -1) return null;

  return JSON.parse(str.slice(startOfArrayIdx, endOfArrayIdx + 1));
}

export function extractExtension(filename: string): string | null {
  const extensionIdx = filename.lastIndexOf('.');
  if (extensionIdx === -1) return null;

  return filename.slice(extensionIdx + 1);
}

export function extractXmlTag(text: string, tagName: string): string | null {
  const startIdx = text.indexOf(`<${tagName}>`) + tagName.length + 2;
  if (startIdx === -1) return null;

  const endIdx = text.indexOf(`</${tagName}>`);
  if (endIdx === -1) return null;

  return text.slice(startIdx, endIdx).trim();
}
