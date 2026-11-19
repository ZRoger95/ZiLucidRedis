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
  const match = /^(\s*)([A-Za-z][A-Za-z0-9-]*)(\s+)(.*)$/.exec(raw);
  if (!match) {
    return null;
  }
  return { prefix: match[1], name: match[2], rest: match[4] };
}

/** 取第一个参数；带空格的引号值按整体处理，替换后仍保留引号。 */
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

/** ACL 里一条 user 行可能带多个 `>password`，全部替换。 */
function passwordTargets(rest: string): Target[] {
  const targets: Target[] = [];
  for (const match of rest.matchAll(/(^|\s)(>\S+)/g)) {
    const start = match.index + match[1].length;
    targets.push({ token: match[2], start, end: start + match[2].length });
  }
  return targets;
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
    if (targets.length === 0 || targets.every((target) => PLACEHOLDER_RE.test(target.token))) {
      return raw;
    }

    const key = isUser ? 'user-pass' : shape.name;
    const replacements = targets.map((target) => {
      const index = (counters.get(key) ?? 0) + 1;
      counters.set(key, index);
      vault.set(`${key}#${index}`, target.token);
      found += 1;
      return { ...target, placeholder: `\${env_${key}}` };
    });

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
