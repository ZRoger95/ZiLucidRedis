import type { FreeLineKind } from '../types';

/** 由配置加载器或 ACL 模块处理、因而不在 config.c 标准配置表里的指令。 */
export const FREE_LINE_NAMES = new Set(['include', 'loadmodule', 'user', 'rename-command']);

/** 哪些区域提供自由行编辑器。 */
export const SECTION_FREE_LINES: Record<string, FreeLineKind[]> = {
  INCLUDES: ['include'],
  MODULES: ['loadmodule'],
  SECURITY: ['user', 'renameCommand'],
};
