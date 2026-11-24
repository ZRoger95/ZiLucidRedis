const SENSITIVE_NAMES = new Set(['requirepass', 'masterauth', 'tls-key-file-pass', 'tls-client-key-file-pass']);

const PLACEHOLDER_RE = /\$\{env_[^}]+\}/;

interface LineShape {
  prefix: string;
  name: string;
  rest: string;
}

interface Target {
  token: string;
  start: number;
  end: number;
}

function shapeLine(raw: string): LineShape | null {
  const match = /^(\s*)([A-Za-z][A-Za-z0-9-]*)(\s+)([^\n]*)$/.exec(raw);
  if (!match) {
    return null;
  }
  return { prefix: match[1], name: match[2], rest: match[4] };
}

function firstToken(rest: string): Target | null {
  const quoted = /^\s*("(?:[^"\\]|\\.)*")/.exec(rest);
  if (quoted) {
    const start = quoted[0].length - quoted[1].length;
    return { token: quoted[1], start, end: start + quoted[1].length };
  }
  const match = /\S+/.exec(rest);
  if (!match) {
    return null;
  }
  return {
    token: match[0],
    start: match.index,
    end: match.index + match[0].length,
  };
}

function passwordTargets(rest: string): Target[] {
  const targets: Target[] = [];
  for (const match of rest.matchAll(/(^|\s)(>\S+)/g)) {
    const start = match.index + match[1].length;
    targets.push({ token: match[2], start, end: start + match[2].length });
  }
  for (const match of rest.matchAll(/\$\{env_user-pass\}/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (targets.some((target) => start >= target.start && end <= target.end)) {
      continue;
    }
    targets.push({ token: match[0], start, end });
  }
  return targets.sort((a, b) => a.start - b.start);
}

export function replaceSecrets(text: string): { text: string; vault: Map<string, string>; found: number } {
  const vault = new Map<string, string>();
  const counters = new Map<string, number>();
  let found = 0;

  const lines = text.split('\n').map((raw) => {
    const shape = shapeLine(raw);
    if (!shape) {
      return raw;
    }

    const isUser = shape.name === 'user';
    if (!SENSITIVE_NAMES.has(shape.name) && !isUser) {
      return raw;
    }

    const targets = isUser ? passwordTargets(shape.rest) : [firstToken(shape.rest)].filter((item) => item !== null);
    if (targets.length === 0) {
      return raw;
    }

    const key = isUser ? 'user-pass' : shape.name;
    let replaced = false;
    const replacements = targets.map((target) => {
      const existing = PLACEHOLDER_RE.exec(target.token);
      if (existing) {
        const envName = existing[0].slice(6, -1);
        const index = (counters.get(envName) ?? 0) + 1;
        counters.set(envName, index);
        vault.set(`${envName}#${index}`, existing[0]);
        return { ...target, placeholder: target.token };
      }
      const index = (counters.get(key) ?? 0) + 1;
      counters.set(key, index);
      vault.set(`${key}#${index}`, target.token);
      replaced = true;
      found += 1;
      return { ...target, placeholder: `\${env_${key}}` };
    });
    if (!replaced) {
      return raw;
    }

    let rest = shape.rest;
    for (const target of [...replacements].reverse()) {
      rest = rest.slice(0, target.start) + target.placeholder + rest.slice(target.end);
    }
    return `${shape.prefix}${shape.name} ${rest}`;
  });

  return { text: lines.join('\n'), vault, found };
}

export function restoreSecrets(text: string, vault: Map<string, string>): string {
  if (vault.size === 0) {
    return text;
  }
  const counters = new Map<string, number>();

  return text
    .split('\n')
    .map((raw) => {
      if (!PLACEHOLDER_RE.test(raw)) {
        return raw;
      }
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
