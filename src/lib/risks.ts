import type { AnalysisResult, DictFile, RiskWarning } from '../types';
import rules from '../data/risk-rules.json';

type Rule = (value: (name: string) => string, has: (name: string) => boolean) => boolean | string;

const isOpenBind = (value: string) => {
  const parts = value.split(/\s+/);
  return parts.some((part) => part === '*' || part === '0.0.0.0' || part === '-::*' || part === '::');
};

const predicates: Record<string, { test: Rule; drive: string }> = {
  'no-auth-protected-mode-off': {
    drive: 'protected-mode',
    test: (value) => value('protected-mode') === 'no' && value('requirepass') === '' && !value('user'),
  },
  'open-bind': {
    drive: 'bind',
    test: (value) => value('protected-mode') === 'yes' && isOpenBind(value('bind')),
  },
  'no-persistence': {
    drive: 'appendonly',
    test: (value) => value('appendonly') !== 'yes' && value('save') === '',
  },
  'policy-without-limit': {
    drive: 'maxmemory',
    test: (value) => value('maxmemory') === '0' && value('maxmemory-policy') !== 'noeviction',
  },
  'limit-without-eviction': {
    drive: 'maxmemory-policy',
    test: (value) => value('maxmemory') !== '0' && value('maxmemory-policy') === 'noeviction',
  },
  'appendfsync-always': {
    drive: 'appendfsync',
    test: (value) => value('appendfsync') === 'always',
  },
  'daemonize-no-log': {
    drive: 'daemonize',
    test: (value) => value('daemonize') === 'yes' && value('logfile') === '',
  },
  'replica-read-only-off': {
    drive: 'replica-read-only',
    test: (value) => value('replica-read-only') === 'no',
  },
  'cluster-without-config': {
    drive: 'cluster-enabled',
    test: (value, has) => value('cluster-enabled') === 'yes' && !has('cluster-config-file'),
  },
  'weak-requirepass': {
    drive: 'requirepass',
    test: (value) => {
      const password = value('requirepass');
      return password.length > 0 && password.length < 12;
    },
  },
};

export function evaluateRisks(result: AnalysisResult, dict: DictFile): RiskWarning[] {
  const aliases: Record<string, string> = { 'replica-read-only': 'replica-read-only' };
  void aliases;
  const value = (name: string) => (result.effective.get(name) ?? []).join(' ').toLowerCase().trim();
  const has = (name: string) => result.firstLineOf.has(name);
  const known = new Set(dict.directives.map((directive) => directive.name));
  const warnings: RiskWarning[] = [];

  for (const [id, config] of Object.entries(rules)) {
    const predicate = predicates[id];
    if (!predicate || !known.has(predicate.drive) || !predicate.test(value, has)) continue;
    const lineNo = result.firstLineOf.get(predicate.drive);
    warnings.push({
      id,
      level: config.level as RiskWarning['level'],
      message: config.message.replace('{{value}}', value(predicate.drive)),
      lineNos: lineNo ? [lineNo] : [],
      source: lineNo ? 'explicit' : 'default',
    });
  }

  return warnings;
}
