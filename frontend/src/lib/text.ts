export const tokenizeWords = (input: string): string[] =>
  input
    .trim()
    .split(/\s+/)
    .filter(Boolean);
