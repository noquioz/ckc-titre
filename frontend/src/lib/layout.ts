export interface WrappedLine {
  words: string[];
  width: number;
}

export interface WrapResult {
  lines: WrappedLine[];
  lineHeight: number;
}

export const wrapWordsIntoLines = (
  words: string[],
  maxWidth: number,
  measureWord: (word: string) => number,
  spacing: number,
  fontSize: number,
): WrapResult => {
  const lines: WrappedLine[] = [];
  let currentWords: string[] = [];
  let currentWidth = 0;

  words.forEach((word) => {
    const wordWidth = measureWord(word);
    const extraSpace = currentWords.length > 0 ? spacing : 0;
    const candidateWidth = currentWidth + extraSpace + wordWidth;

    if (candidateWidth <= maxWidth || currentWords.length === 0) {
      currentWords.push(word);
      currentWidth = candidateWidth;
      return;
    }

    lines.push({ words: currentWords, width: currentWidth });
    currentWords = [word];
    currentWidth = wordWidth;
  });

  if (currentWords.length > 0) {
    lines.push({ words: currentWords, width: currentWidth });
  }

  return {
    lines,
    lineHeight: fontSize * 1.18,
  };
};
