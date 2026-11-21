import { describe, expect, it } from 'vitest';

import { findCssComments } from '../scripts/check-css-comments';

describe('findCssComments', () => {
  it('finds CSS block comments', () => {
    expect(findCssComments('a { color: red; /* explain */ }')).toEqual([{ offset: 16 }]);
  });

  it('ignores comment delimiters inside strings and escaped quotes', () => {
    expect(findCssComments('a::before { content: "/* text */"; } b::after { content: "\\"/* text */"; }')).toEqual([]);
  });
});
