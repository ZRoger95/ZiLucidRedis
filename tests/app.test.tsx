import { render, screen } from '@testing-library/react';
import App from '../src/App';

test('renders the tool title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Redis 配置体检' })).toBeInTheDocument();
});
