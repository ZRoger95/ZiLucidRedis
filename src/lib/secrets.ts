const SENSITIVE_NAMES = new Set([
  'requirepass',
  'masterauth',
  'tls-key-file-pass',
  'tls-client-key-file-pass',
]);

const PLACEHOLDER_RE = /\$\{env_[^}]+\}/;

interface LineShape {
  prefix: string;
  name: string;
  rest: string;
}

function shapeLine(raw: string): LineShape | null {
  const match = /^(\s*)([A-Za-z][A-Za-z0-9-]*)(\s+)(.*)$/.exec(raw);
  if (!match) return null;
  return { prefix: match[1], name: match[2], rest: match[4] };
}

function firstToken(rest: string): { token: string; start: number; end: number } | null {
  const match = /\S+/.exec(rest);
  if (!match) return null;
  return {
    token: match[0],
    start: match.index,
    end: match.index + match[0].length,
  };
}

export function replaceSecrets(text: string): { text: string; vault: Map<string, string>; found: number } {
  const vault = new Map<string, string>();
  const counters = new Map<string, number>();
  let found = 0;

  const lines = text.split('\n').map((raw) => {
    const shape = shapeLine(raw);
    if (!shape) return raw;

    const isUser = shape.name === 'user';
    if (!SENSITIVE_NAMES.has(shape.name) && !isUser) return raw;

    let target: { token: string; start: number; end: number } | null = null;
    if (isUser) {
      const match = /(^|\s)(>[^\s]+)/.exec(shape.rest);
      if (!match) return raw;
      const start = match.index + match[1].length;
      target = { token: match[2], start, end: start + match[2].length };
    } else {
      target = firstToken(shape.rest);
    }
    if (!target || !target.token || PLACEHOLDER_RE.test(target.token)) return raw;

    const key = isUser ? 'user-pass' : shape.name;
    const index = (counters.get(key) ?? 0) + 1;
    counters.set(key, index);
    vault.set(`${key}#${index}`, target.token);
    found += 1;

    const placeholder = `\${env_${key}}`;
    const rest = shape.rest.slice(0, target.start) + placeholder + shape.rest.slice(target.end);
    return `${shape.prefix}${shape.name} ${rest}`;
  });

  return { text: lines.join('\n'), vault, found };
}

export function restoreSecrets(text: string, vault: Map<string, string>): string {
  if (vault.size === 0) return text;
  const counters = new Map<string, number>();

  return text
    .split('\n')
    .map((raw) => {
      if (!PLACEHOLDER_RE.test(raw)) return raw;
      return raw.replace(/\$\{env_([^}]+)\}/g, (whole, key: string) => {
        const index = (counters.get(key) ?? 0) + 1;
        counters.set(key, index);
        return vault.get(`${key}#${index}`) ?? whole;
      });
    })
    .join('\n');
}

export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}
