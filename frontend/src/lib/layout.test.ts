import { describe, expect, it } from 'vitest';
import { wrapWordsIntoLines } from './layout';

describe('wrapWordsIntoLines', () => {
  it('wraps words to respect max width', () => {
    const words = ['HELLO', 'WORLD', 'FROM', 'TEST'];

    const result = wrapWordsIntoLines(
      words,
      120,
      (word) => word.length * 20,
      8,
      100,
    );

    expect(result.lines.length).toBeGreaterThan(1);
    result.lines.forEach((line) => {
      expect(line.width).toBeLessThanOrEqual(120);
    });
  });
});
