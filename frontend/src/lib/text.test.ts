import { describe, expect, it } from 'vitest';
import { tokenizeWords } from './text';

describe('tokenizeWords', () => {
  it('keeps punctuation attached to words', () => {
    expect(tokenizeWords('Bonjour, monde !')).toEqual(['Bonjour,', 'monde', '!']);
  });

  it('collapses repeated whitespace', () => {
    expect(tokenizeWords('A   B\n\nC')).toEqual(['A', 'B', 'C']);
  });
});
