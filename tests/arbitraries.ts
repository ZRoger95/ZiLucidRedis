import fc from 'fast-check';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface PlantedConf {
  planted: string[];
  text: string;
}

interface ConfLine {
  line: string;
  planted: string[];
}

const SENSITIVE_NAMES = ['masterauth', 'requirepass', 'tls-client-key-file-pass', 'tls-key-file-pass'];

export const secretBodyArb = fc.stringMatching(/^[A-Z][A-Za-z0-9!#%+=_-]{7,19}$/);

const quotedWordArb = fc.stringMatching(/^[A-Z][A-Za-z0-9]{3,9}$/);

const secretValueArb = fc.oneof(
  secretBodyArb.map((body) => ({ secret: body, token: body })),
  fc.array(quotedWordArb, { maxLength: 3, minLength: 1 }).map((words) => {
    const inner = words.join(' ');
    return { secret: inner, token: `"${inner}"` };
  }),
  fc.tuple(quotedWordArb, quotedWordArb).map(([head, tail]) => {
    const inner = `${head}\\"${tail}`;
    return { secret: inner, token: `"${inner}"` };
  }),
);

function sensitiveLineArb(indent: fc.Arbitrary<string>, gap: fc.Arbitrary<string>): fc.Arbitrary<ConfLine> {
  return fc
    .tuple(fc.constantFrom(...SENSITIVE_NAMES), indent, gap, secretValueArb)
    .map(([name, prefix, separator, value]) => ({
      line: `${prefix}${name}${separator}${value.token}`,
      planted: [value.secret],
    }));
}

const userSegmentArb: fc.Arbitrary<{ planted: string[]; text: string }> = fc.oneof(
  secretBodyArb.map((body) => ({ planted: [body], text: `>${body}` })),
  fc.constantFrom('&*', '+@all', '~*', 'on').map((text) => ({ planted: [], text })),
);

function userLineArb(indent: fc.Arbitrary<string>, gap: fc.Arbitrary<string>): fc.Arbitrary<ConfLine> {
  return fc
    .tuple(indent, fc.stringMatching(/^[a-z]{3,8}$/), gap, fc.array(userSegmentArb, { maxLength: 6, minLength: 1 }))
    .map(([prefix, name, separator, segments]) => ({
      line: `${prefix}user${separator}${name} on ${segments.map((segment) => segment.text).join(' ')}`,
      planted: segments.flatMap((segment) => segment.planted),
    }));
}

const placeholderLineArb: fc.Arbitrary<ConfLine> = fc.oneof(
  fc.constantFrom(...SENSITIVE_NAMES).map((name) => ({ line: `${name} \${env_${name}}`, planted: [] })),
  fc.constantFrom(...SENSITIVE_NAMES).map((name) => ({ line: `${name} "\${env_${name}}"`, planted: [] })),
  fc.constant('user guest on ${env_user-pass} ~* +@all').map((line) => ({ line, planted: [] })),
  fc.constant('user guest on >"${env_user-pass}" ~*').map((line) => ({ line, planted: [] })),
  fc.constant('requirepass ${env_masterauth}').map((line) => ({ line, planted: [] })),
);

const fillerLineArb: fc.Arbitrary<ConfLine> = fc
  .constantFrom(
    '',
    '# 注释',
    'appendonly yes',
    'bind 127.0.0.1',
    'daemonize no',
    'maxmemory 0',
    'port 6379',
    'protected-mode yes',
  )
  .map((line) => ({ line, planted: [] }));

function confArb(
  indent: fc.Arbitrary<string>,
  gap: fc.Arbitrary<string>,
  newline: fc.Arbitrary<string>,
  trailing: fc.Arbitrary<boolean>,
): fc.Arbitrary<PlantedConf> {
  const lineArb = fc.oneof(
    { arbitrary: sensitiveLineArb(indent, gap), weight: 3 },
    { arbitrary: userLineArb(indent, gap), weight: 2 },
    { arbitrary: fillerLineArb, weight: 3 },
    { arbitrary: placeholderLineArb, weight: 1 },
  );
  return fc
    .tuple(sensitiveLineArb(indent, gap), fc.array(lineArb, { maxLength: 10 }), newline, trailing)
    .map(([first, rest, eol, end]) => {
      const lines = [first, ...rest];
      return {
        planted: lines.flatMap((item) => item.planted),
        text: lines.map((item) => item.line).join(eol) + (end ? eol : ''),
      };
    });
}

export const confWithSecretsArb: fc.Arbitrary<PlantedConf> = confArb(
  fc.constantFrom('', ' ', '  ', '\t'),
  fc.constantFrom(' ', '  ', '\t', ' \t'),
  fc.constantFrom('\n', '\r\n'),
  fc.boolean(),
);

export const canonicalConfArb: fc.Arbitrary<PlantedConf> = confArb(
  fc.constant(''),
  fc.constant(' '),
  fc.constant('\n'),
  fc.constant(true),
);

const officialDir = path.resolve(process.cwd(), 'src/data/official');

const officialTexts = readdirSync(officialDir)
  .filter((file) => file.endsWith('.conf'))
  .map((file) => readFileSync(path.join(officialDir, file), 'utf8'));

export const mutatedConfArb: fc.Arbitrary<string> = fc.constantFrom(...officialTexts).chain((text) => {
  const lines = text.split('\n');
  return fc.oneof(
    fc.nat({ max: text.length }).map((cut) => text.slice(0, cut)),
    fc.shuffledSubarray(lines, { maxLength: lines.length }).map((subset) => subset.join('\n')),
    fc
      .tuple(fc.nat({ max: lines.length - 1 }), fc.stringMatching(/^[^\n]{0,40}$/))
      .map(([index, junk]) => [...lines.slice(0, index), junk, ...lines.slice(index)].join('\n')),
  );
});
