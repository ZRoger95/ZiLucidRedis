import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';

import App from '../src/App';
import { STORAGE_KEY } from '../src/lib/persistence';

afterEach(() => {
  localStorage.clear();
});

test('renders the tool title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});

test('diff 行按 Esc 后焦点回到编辑器', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      line: '7.4',
      text: 'maxmemory 128mb\n',
      annotationMode: 'off',
      onlyDiff: false,
      showZh: false,
      bottomCollapsed: false,
    }),
  );

  const { container } = render(<App />);
  const row = await waitFor(() => {
    const found = container.querySelector<HTMLElement>('[data-slot="diff-row"]');
    if (!found) {
      throw new Error('diff 行尚未渲染');
    }
    return found;
  });

  await act(async () => {
    row.focus();
  });
  await userEvent.keyboard('{Escape}');

  await waitFor(() => {
    expect(document.activeElement).toHaveClass('cm-content');
  });
});
