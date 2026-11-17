import { useEffect } from 'react';

export function useShortcut(keys: 'mod+k', handler: () => void): void {
  useEffect(() => {
    const key = keys.split('+').at(-1) ?? '';
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }
      if (event.shiftKey || event.altKey) {
        return;
      }
      if (event.key.toLowerCase() !== key) {
        return;
      }
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys, handler]);
}
