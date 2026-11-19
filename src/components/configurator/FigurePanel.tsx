import type { ComponentType, CSSProperties } from 'react';

import {
  Basket,
  Branches,
  Cabinet,
  Dish,
  Drawer,
  Elevator,
  Exploded,
  Format,
  Hub,
  Keyboard,
  Laptop,
  Lockers,
  Loupe,
  Padlock,
  Patch,
  Phone,
  Phosphor,
  Plot,
  Plug,
  Rail,
  Rebuild,
  Relay,
  Riffle,
  Router,
  Settle,
  Sieve,
  Slow,
  Stack,
  Terminal,
  Terrain,
  Turntable,
  Vault,
} from '@lucasmarkes/hairline/react';

import registry from '@/data/configurator.json';

interface FigureProps {
  intensity?: number;
  theme?: 'auto' | 'light' | 'dark';
  label?: string;
  'aria-hidden'?: boolean;
}

const FIGURES: Record<string, ComponentType<FigureProps>> = {
  Basket,
  Branches,
  Cabinet,
  Dish,
  Drawer,
  Elevator,
  Exploded,
  Format,
  Hub,
  Keyboard,
  Laptop,
  Lockers,
  Loupe,
  Padlock,
  Patch,
  Phone,
  Phosphor,
  Plot,
  Plug,
  Rail,
  Rebuild,
  Relay,
  Riffle,
  Router,
  Settle,
  Sieve,
  Slow,
  Stack,
  Terminal,
  Terrain,
  Turntable,
  Vault,
};

const PANEL_BG = '#fbfbfc';

export function FigurePanel({ id }: { id: string }) {
  const meta = (registry.sections as Record<string, { name: string; summary: string; figure?: string }>)[id];
  const Figure = meta?.figure ? FIGURES[meta.figure] : undefined;

  if (!Figure || !meta) {
    return null;
  }

  return (
    <aside
      aria-hidden
      className="hidden w-72 shrink-0 border-l border-line bg-[#fbfbfc] px-5 py-8 xl:block"
      style={{ '--hairline-plate': PANEL_BG } as CSSProperties}
    >
      <Figure intensity={0.4} theme="light" aria-hidden />
      <p className="mt-6 text-[12px] leading-5 text-muted-foreground">{meta.summary}</p>
    </aside>
  );
}
