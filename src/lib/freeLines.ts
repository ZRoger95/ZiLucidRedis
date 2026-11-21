import type { FreeLineKind } from '../types';

export const FREE_LINE_NAMES = new Set(['include', 'loadmodule', 'user', 'rename-command']);

export const SECTION_FREE_LINES: Record<string, FreeLineKind[]> = {
  INCLUDES: ['include'],
  MODULES: ['loadmodule'],
  SECURITY: ['user', 'renameCommand'],
};
