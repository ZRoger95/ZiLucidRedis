import { createRovingFocus, definePrimitive, selects } from '@ui-sdk/core';
import { createParts } from '@ui-sdk/react/primitive';

type DiffRowsState = { focused: string | null };
type DiffAgentItem = { value: string; label: string };
type DiffRowsOptions = {
  agentItems?: DiffAgentItem[];
  onActivate?: (value: string) => void;
  onEscape?: () => void;
};
type DiffRowProps = { value: string; lineNo: number; label: string };

const diffRows = definePrimitive({
  name: 'diff-rows',
  options: { agentItems: 'value', onActivate: 'callback', onEscape: 'callback' },
  state: (_options: DiffRowsOptions): DiffRowsState => ({ focused: null }),
  api: (context) => {
    const roving = createRovingFocus<DiffRowsState, DiffRowProps>(context, {
      slot: 'row',
      key: 'focused',
      focusable: (item) => item.props.lineNo > 0,
    });
    const activate = (value: string) => {
      const item = context.options().agentItems?.find((candidate) => candidate.value === value);
      if (!item) {
        return false;
      }
      context.options().onActivate?.(item.value);
      return true;
    };
    return {
      roving,
      activate,
      agentItems: () => context.options().agentItems ?? [],
      keydown(event: KeyboardEvent, el: HTMLElement, value: string) {
        if (event.key === 'Escape') {
          event.preventDefault();
          context.options().onEscape?.();
          return;
        }
        if (event.target !== el) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          activate(value);
          return;
        }
        roving.keydown(event, el);
      },
    };
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: 'group', 'aria-label': '配置对比行' }) }),
    row: slot<DiffRowProps>({
      props: { value: 'string', lineNo: 'number', label: 'string' },
      selects: selects({ focused: ({ key }) => [key, null] }),
      attrs: (state, part) => ({
        'data-slot': 'diff-row',
        'aria-label': part.props.lineNo > 0 ? part.props.label : undefined,
        tabindex: part.api.roving.tabIndex(state, part),
      }),
      on: {
        keydown: (event, { el, api, key }) => api.keydown(event, el!, key),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
  agent: { actions: ['activate'], items: (api) => api.agentItems() },
});

const parts = createParts(diffRows, { root: 'div', row: 'div' });

export const DiffRows = parts.Root;
export const DiffRowItem = parts.Row;
export { diffRows };
