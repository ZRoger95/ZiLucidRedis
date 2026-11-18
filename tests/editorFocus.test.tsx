import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { AnalysisResult } from '../src/types';

import { Editor } from '../src/components/Editor';

const result: AnalysisResult = {
  lines: [],
  byLine: new Map(),
  counts: { changed: 0, unknown: 0, removed: 0, newer: 0, duplicate: 0 },
  missing: [],
  firstLineOf: new Map(),
  effective: new Map(),
};

test('focusRequest 变化后焦点进入编辑器', () => {
  const { rerender } = render(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={null}
      focusRequest={0}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  rerender(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={null}
      focusRequest={1}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  expect(document.activeElement).toHaveClass('cm-content');
});

test('jumpTo 要求不聚焦时焦点留在编辑器之外', () => {
  const button = document.createElement('button');
  document.body.append(button);
  button.focus();

  const { rerender } = render(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={{ lineNo: 1, nonce: 1, focus: false }}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  expect(button).toHaveFocus();

  rerender(
    <Editor
      value="maxmemory 0"
      result={result}
      blocks={[]}
      onlyDiff={false}
      jumpTo={{ lineNo: 1, nonce: 2, focus: true }}
      onChange={vi.fn()}
      onCursorLine={vi.fn()}
      onCommitComment={vi.fn()}
    />,
  );
  expect(document.activeElement).toHaveClass('cm-content');

  button.remove();
});
